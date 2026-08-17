/**
 * Calendar → app sync.
 *
 * Every attending member holds their OWN copy of a meeting (that is how the meeting is guaranteed
 * onto their calendar without anyone having to accept an invite). The cost of that design is that
 * dragging one copy to a new time in Google changes only that copy: the other members, the Zoho
 * mirror, our record, the reminder and the reschedule link all stay on the old time.
 *
 * So we read the copies back on a schedule. If one has moved, that is treated as the new time and
 * everything else is brought into line — the other members' copies, the Zoho mirror, our booking
 * row — and everyone is told. No invites, no RSVPs, nothing for anyone to accept: whoever moves it
 * in their own calendar has effectively rescheduled the meeting for the whole group.
 */
import { Resend } from "resend";
import {
  listUpcomingConfirmed, listMembers, getMeetingTypeById, updateBookingTime, clearReminderMark, storedTitle,
  type Booking,
} from "./db";
import { readMeetingTimes, moveMeetingEvents, type MemberEvent } from "./google";
import { moveZohoEvents, readZohoTimes, type ZohoEvent } from "./zoho";
import { buildICS, icsSequence } from "./ics";
import { meetingInviteHTML, whenIST } from "./email";
import { SITE_URL } from "@/lib/seo";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Below this, a difference is rounding or a timezone artefact — not somebody moving a meeting. */
const DRIFT_TOLERANCE_MS = 60_000;

const parseEvents = <T,>(raw: string | null): T[] => {
  if (!raw) return [];
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
};

/**
 * Which time is the real one now?
 *
 * Whoever moved their copy wins — that is the point. When several copies disagree (two people
 * moved it before we looked), the host's copy is authoritative, because that is the copy the
 * guest was invited from and the one carrying the Meet link.
 */
function decideNewTime(booking: Booking, times: { memberId: string; startISO: string | null }[], hostId: string | null) {
  const stored = Date.parse(booking.start_utc);
  const moved = times.filter((t) => t.startISO && Math.abs(Date.parse(t.startISO) - stored) > DRIFT_TOLERANCE_MS);
  if (!moved.length) return null;
  const host = moved.find((t) => t.memberId === hostId);
  const winner = host || moved[0];
  return { startISO: winner.startISO!, movedBy: winner.memberId, others: moved.length };
}

export async function syncCalendarChanges(): Promise<{ checked: number; moved: number }> {
  const bookings = await listUpcomingConfirmed();
  if (!bookings.length) return { checked: 0, moved: 0 };
  const members = await listMembers();
  const byId = new Map(members.map((m) => [m.id, m]));
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
  const from = process.env.CONTACT_FROM_EMAIL || "Avloryn Labs <onboarding@resend.dev>";
  let moved = 0;

  for (const b of bookings) {
    try {
      const gEvents = parseEvents<MemberEvent>(b.google_event_id);
      const zEvents = parseEvents<ZohoEvent>(b.zoho_event_id ?? null);
      if (!gEvents.length && !zEvents.length) continue;
      // Read BOTH sides. Most of the team works in Zoho, so that is where a meeting is most
      // likely to be dragged; watching only Google would miss it entirely.
      const [gTimes, zTimes] = await Promise.all([
        gEvents.length ? readMeetingTimes(gEvents) : Promise.resolve([]),
        zEvents.length ? readZohoTimes(zEvents) : Promise.resolve([]),
      ]);
      const times = [...gTimes, ...zTimes];
      if (!times.length) continue;

      // The host is whichever member's event was written first — it holds the Meet link.
      const decision = decideNewTime(b, times, gEvents[0]?.memberId ?? null);
      if (!decision) continue;

      const durationMs = Date.parse(b.end_utc) - Date.parse(b.start_utc);
      const startISO = decision.startISO;
      const endISO = new Date(Date.parse(startISO) + durationMs).toISOString();
      const whoMoved = byId.get(decision.movedBy)?.name || "someone";
      console.log(`[sync] ${whoMoved} moved booking ${b.id} to ${startISO} — bringing everything else along`);

      // Everyone EXCEPT the copy that was already moved (patching it again would be pointless
      // and would re-notify the guest for a change they made themselves).
      const gToMove = gEvents.filter((e) => e.memberId !== decision.movedBy);
      if (gToMove.length) await moveMeetingEvents(gToMove, startISO, endISO);
      const zToMove = zEvents.filter((e) => e.memberId !== decision.movedBy);
      if (zToMove.length) await moveZohoEvents(zToMove, startISO, endISO);

      await updateBookingTime(b.id, startISO, endISO);
      // The reminder was for the old time — let it fire again for the new one.
      await clearReminderMark(b.id);
      moved++;

      // Tell everyone, with a fresh .ics so calendars that only ever saw the email invite update too.
      if (resend) {
        const mt = b.meeting_type_id ? await getMeetingTypeById(b.meeting_type_id) : null;
        const title = mt?.name || storedTitle(b) || "Meeting";
        const memberEmails = b.member_ids.map((id) => byId.get(id)?.email).filter(Boolean) as string[];
        const ics = buildICS({
          uid: b.id, startISO, endISO, summary: `${title} — Avloryn Labs`,
          description: b.meet_link ? `Join Google Meet: ${b.meet_link}` : "",
          location: b.meet_link || "Online", organizerName: "Avloryn Labs",
          organizerEmail: memberEmails[0] || undefined,
          attendeeEmails: [b.client_email, ...memberEmails].filter(Boolean),
          sequence: icsSequence(),
        });
        const attachments = [{ filename: "invite.ics", content: Buffer.from(ics).toString("base64") }];
        const rescheduleUrl = `${SITE_URL}/meet/reschedule?t=${b.cancel_token}`;
        const cancelUrl = `${SITE_URL}/meet/cancel?t=${b.cancel_token}`;
        const recipients: { to: string; name?: string; withWho: string }[] = [];
        if (b.client_email && EMAIL_RE.test(b.client_email)) {
          recipients.push({ to: b.client_email, name: b.client_name, withWho: b.member_ids.map((id) => byId.get(id)?.name).filter(Boolean).join(", ") });
        }
        for (const id of b.member_ids) {
          const m = byId.get(id);
          // The person who moved it knows; no need to email them their own change.
          if (!m?.email || !EMAIL_RE.test(m.email) || id === decision.movedBy) continue;
          recipients.push({ to: m.email, name: m.name, withWho: b.client_name || "—" });
        }
        for (const r of recipients) {
          try {
            await resend.emails.send({
              from, to: r.to, subject: `Moved: ${title} is now ${whenIST(startISO)}`,
              html: meetingInviteHTML({
                heading: "New time", title, whenText: whenIST(startISO), withNames: r.withWho,
                greetingName: (r.name || "").split(" ")[0] || undefined,
                notes: `${whoMoved} moved this meeting.`, meetLink: b.meet_link, rescheduleUrl, cancelUrl,
              }),
              text: `${title} has moved to ${whenIST(startISO)} (${whoMoved} moved it).\n${b.meet_link ? `Join: ${b.meet_link}\n` : ""}Reschedule: ${rescheduleUrl}\nCancel: ${cancelUrl}`,
              attachments,
            });
          } catch (e) { console.error("[sync] could not email", r.to, e); }
        }
      }
    } catch (e) {
      console.error(`[sync] booking ${b.id} skipped:`, e);
    }
  }
  return { checked: bookings.length, moved };
}
