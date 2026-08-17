import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { Resend } from "resend";
import { canSchedule } from "@/lib/booking/admin";
import { listMembers, createBooking, titleAnswer, membersWithZoho } from "@/lib/booking/db";
import { createMeetingForMembers } from "@/lib/booking/google";
import { createZohoForMembers } from "@/lib/booking/zoho";
import { buildICS } from "@/lib/booking/ics";
import { meetingInviteHTML, whenIST } from "@/lib/booking/email";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Owner/team manually create a meeting at a chosen time (no booking link needed) and
// optionally email the guest an invite + Meet link. Reuses the full calendar plumbing.
export async function POST(req: Request) {
  if (!(await canSchedule())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const d = await req.json().catch(() => ({}));

  const title = String(d.title || "").trim() || "Meeting";
  const startMs = Date.parse(String(d.startISO || ""));
  const durationMin = Math.max(5, Math.round(Number(d.durationMin) || 30));
  if (Number.isNaN(startMs)) return NextResponse.json({ error: "Pick a valid date & time" }, { status: 400 });

  const all = await listMembers();
  const valid = new Set(all.map((m) => m.id));
  // De-duplicate: the same id twice means that person's calendar is written twice — once as host
  // and once as "another member" — and they see the meeting twice.
  let memberIds: string[] = Array.from(
    new Set((Array.isArray(d.memberIds) ? d.memberIds.map(String) : []).filter((id: string) => valid.has(id))),
  );
  if (!memberIds.length) return NextResponse.json({ error: "Pick at least one member" }, { status: 400 });
  const organizerId = d.organizerId && memberIds.includes(String(d.organizerId)) ? String(d.organizerId) : null;
  if (organizerId) memberIds = [organizerId, ...memberIds.filter((id) => id !== organizerId)];

  const clientName = String(d.clientName || "").trim();
  const clientEmail = String(d.clientEmail || "").trim();
  const notes = String(d.notes || "").trim();
  const startISO = new Date(startMs).toISOString();
  const endISO = new Date(startMs + durationMin * 60_000).toISOString();

  const byId = new Map(all.map((m) => [m.id, m]));
  const memberEmails = memberIds.map((id) => byId.get(id)?.email).filter(Boolean) as string[];
  const memberNames = memberIds.map((id) => byId.get(id)?.name).filter(Boolean).join(", ");
  const guest = clientEmail && EMAIL_RE.test(clientEmail) ? clientEmail : "";
  const baseDesc = `${title}${clientName ? ` with ${clientName}` : ""}.${notes ? `\n\nNotes: ${notes}` : ""}`;

  // Zoho is the working calendar for whoever has it connected; Google is what produces the Meet
  // link and invites the guest. So each member gets exactly ONE copy, on the calendar they use.
  const zohoIds = await membersWithZoho(memberIds);
  // Host the Meet on someone who does NOT use Zoho where possible — their Google event is then
  // their own single copy instead of a second copy of a Zoho one.
  const hostOrder = [...memberIds.filter((id) => !zohoIds.has(id)), ...memberIds.filter((id) => zohoIds.has(id))];
  const googleCopyMemberIds = memberIds.filter((id) => !zohoIds.has(id));

  let meetLink: string | null = null, eventsJson: string | null = null, zohoJson: string | null = null;
  let onGoogle: string[] = [];
  try {
    const { meetLink: ml, events } = await createMeetingForMembers({ memberIds: hostOrder, googleCopyMemberIds, clientEmail: guest, summary: title, description: baseDesc, startISO, endISO });
    meetLink = ml; if (events.length) eventsJson = JSON.stringify(events);
    onGoogle = events.map((e) => e.memberId);
  } catch (e) {
    // A calendar failure must not lose the meeting — but it must not be silent either, or the
    // meeting exists with nothing on anyone's calendar and nobody can tell why.
    console.error("[meet/create] Google calendar failed:", e);
  }
  try {
    const z = await createZohoForMembers({ memberIds, summary: title, description: baseDesc, startISO, endISO, meetLink, alreadyOnGoogle: onGoogle });
    if (z.length) zohoJson = JSON.stringify(z);
  } catch (e) { console.error("[meet/create] Zoho calendar failed:", e); }

  const cancelToken = randomBytes(18).toString("hex");
  const booking = await createBooking({
    meeting_type_id: null, member_ids: memberIds,
    client_name: clientName || "Guest", client_email: guest || "", client_notes: notes, client_timezone: null,
    start_utc: startISO, end_utc: endISO, google_event_id: eventsJson, meet_link: meetLink,
    // Without this the Zoho ids are thrown away and cancel/reschedule can never find those
    // events again — the meeting stays on Zoho calendars forever. The public booking route
    // always saved them; this path silently did not.
    zoho_event_id: zohoJson,
    // Keeps the typed title with the booking so cancellations, reschedules, reminders and the
    // admin list can all name the meeting instead of calling it "Meeting".
    answers: titleAnswer(title),
    cancel_token: cancelToken,
  });

  // Email the guest AND every attending member a branded invite (Meet button + .ics).
  try {
    const key = process.env.RESEND_API_KEY;
    if (key) {
      const from = process.env.CONTACT_FROM_EMAIL || "Avloryn Labs <onboarding@resend.dev>";
      const when = whenIST(startISO);
      const ics = buildICS({ uid: booking.id, startISO, endISO, summary: `${title} — Avloryn Labs`, description: (meetLink ? `Join Google Meet: ${meetLink}\n\n` : "") + baseDesc, location: meetLink || "Online", organizerName: "Avloryn Labs", organizerEmail: memberEmails[0] || undefined, attendeeEmails: [guest, ...memberEmails].filter(Boolean) });
      const attachments = [{ filename: "invite.ics", content: Buffer.from(ics).toString("base64") }];
      const rescheduleUrl = `${SITE_URL}/meet/reschedule?t=${cancelToken}`;
      const cancelUrl = `${SITE_URL}/meet/cancel?t=${cancelToken}`;
      const rz = new Resend(key);

      if (guest) {
        await rz.emails.send({
          from, to: guest, subject: `Invitation: ${title} with Avloryn Labs`,
          html: meetingInviteHTML({ heading: "You're invited", title, whenText: when, withNames: memberNames || "Avloryn Labs", greetingName: clientName || undefined, notes, meetLink, rescheduleUrl, cancelUrl }),
          text: `You're invited to ${title}.\nWhen: ${when}\nWith: ${memberNames || "Avloryn Labs"}\n${meetLink ? `Join: ${meetLink}\n` : ""}Reschedule: ${rescheduleUrl}\nCancel: ${cancelUrl}`,
          attachments,
        });
      }

      // Each attending member gets the meeting on email too (title, date/time, Meet button).
      for (const id of memberIds) {
        const mem = byId.get(id);
        if (!mem?.email || !EMAIL_RE.test(mem.email)) continue;
        const others = [clientName, ...memberIds.filter((x) => x !== id).map((x) => byId.get(x)?.name)].filter(Boolean).join(", ");
        await rz.emails.send({
          from, to: mem.email, subject: `Meeting: ${title}${clientName ? ` — ${clientName}` : ""}`,
          html: meetingInviteHTML({ heading: "New meeting", title, whenText: when, withNames: others || "—", greetingName: (mem.name || "").split(" ")[0] || undefined, notes, meetLink, rescheduleUrl, cancelUrl }),
          text: `Meeting: ${title}\nWhen: ${when}\nWith: ${others || "—"}\n${meetLink ? `Join: ${meetLink}\n` : ""}Reschedule: ${rescheduleUrl}\nCancel: ${cancelUrl}`,
          attachments,
        });
      }
    }
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, meetLink, cancelToken, bookingId: booking.id, invited: !!guest });
}
