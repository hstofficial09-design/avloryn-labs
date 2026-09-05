import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getBookingByCancelToken, markBookingCancelled, getMeetingTypeById, listMembers, storedTitle } from "@/lib/booking/db";
import { deleteMeetingEvent, deleteMeetingEvents, type MemberEvent } from "@/lib/booking/google";
import { deleteZohoEvents, type ZohoEvent } from "@/lib/booking/zoho";
import { buildICS, icsSequence } from "@/lib/booking/ics";
import { meetingCancelledHTML, whenIST } from "@/lib/booking/email";
import { threadHeaders, guestSubject, teamSubject } from "@/lib/booking/thread";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const d = await req.json().catch(() => ({}));
  const b = await getBookingByCancelToken(String(d.token || ""));
  if (!b) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (b.status === "cancelled") return NextResponse.json({ ok: true, already: true });

  // google_event_id stores the per-member [{memberId,eventId}] list — delete each on its
  // own calendar (host first → the client gets the cancellation). Legacy single-id fallback.
  if (b.google_event_id) {
    let events: MemberEvent[] | null = null;
    try { const p = JSON.parse(b.google_event_id); if (Array.isArray(p)) events = p; } catch { /* not JSON */ }
    if (events) await deleteMeetingEvents(events);
    else for (const id of b.member_ids) await deleteMeetingEvent(id, b.google_event_id);
  }
  // Remove the mirrored Zoho events too (best-effort).
  if (b.zoho_event_id) {
    try { const z = JSON.parse(b.zoho_event_id) as ZohoEvent[]; if (Array.isArray(z)) await deleteZohoEvents(z); } catch { /* ignore */ }
  }
  await markBookingCancelled(b.id);

  // Tell everyone it's off — the client AND every attending member (branded).
  try {
    const key = process.env.RESEND_API_KEY;
    if (key) {
      const mt = b.meeting_type_id ? await getMeetingTypeById(b.meeting_type_id) : null;
      const members = await listMembers();
      const byId = new Map(members.map((m) => [m.id, m]));
      const memberNames = b.member_ids.map((id) => byId.get(id)?.name).filter(Boolean).join(", ");
      const from = process.env.CONTACT_FROM_EMAIL || "Avloryn Labs <onboarding@resend.dev>";
      const title = mt?.name || storedTitle(b) || "Meeting";
      const clientWhen = new Date(b.start_utc).toLocaleString("en-IN", { timeZone: b.client_timezone || "Asia/Kolkata", dateStyle: "full", timeStyle: "short" });
      const rz = new Resend(key);
      // A cancellation .ics (same UID, METHOD:CANCEL, higher SEQUENCE) removes the meeting from
      // whatever calendar the invite was added to. Without it, anyone who added the meeting from
      // the original .ics — rather than a Google invite — kept the event forever.
      const memberEmails = b.member_ids.map((id) => byId.get(id)?.email).filter(Boolean) as string[];
      const cancelIcs = buildICS({
        uid: b.id, startISO: b.start_utc, endISO: b.end_utc,
        summary: `${title} — Avloryn Labs`, location: b.meet_link || "Online",
        organizerName: "Avloryn Labs", organizerEmail: memberEmails[0] || undefined,
        attendeeEmails: [b.client_email, ...memberEmails].filter(Boolean),
        method: "CANCEL", status: "CANCELLED", sequence: icsSequence(),
      });
      const cancelAttach = [{ filename: "invite.ics", content: Buffer.from(cancelIcs).toString("base64") }];
      if (b.client_email && EMAIL_RE.test(b.client_email)) {
        await rz.emails.send({
          from, to: b.client_email, subject: guestSubject(title), headers: threadHeaders(b.id),
          html: meetingCancelledHTML({ title, whenText: clientWhen, withNames: memberNames || "Avloryn Labs", greetingName: (b.client_name || "").split(" ")[0] || undefined }),
          text: `Your ${title} on ${clientWhen} has been cancelled and removed from the calendar. — Avloryn Labs`,
          attachments: cancelAttach,
        });
      }
      for (const id of b.member_ids) {
        const em = byId.get(id)?.email;
        if (!em || !EMAIL_RE.test(em)) continue;
        await rz.emails.send({
          from, to: em, subject: teamSubject(title, b.client_name), headers: threadHeaders(b.id),
          html: meetingCancelledHTML({ title, whenText: whenIST(b.start_utc), withNames: b.client_name || "—", greetingName: (byId.get(id)?.name || "").split(" ")[0] || undefined }),
          text: `${title}${b.client_name ? ` with ${b.client_name}` : ""} on ${whenIST(b.start_utc)} has been cancelled and removed from the calendar.`,
          attachments: cancelAttach,
        });
      }
    }
  } catch { /* email best-effort */ }

  return NextResponse.json({ ok: true });
}
