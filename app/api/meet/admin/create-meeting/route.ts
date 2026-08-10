import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { Resend } from "resend";
import { canSchedule } from "@/lib/booking/admin";
import { listMembers, createBooking } from "@/lib/booking/db";
import { createMeetingForMembers } from "@/lib/booking/google";
import { createZohoForMembers } from "@/lib/booking/zoho";
import { buildICS } from "@/lib/booking/ics";
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
  let memberIds: string[] = (Array.isArray(d.memberIds) ? d.memberIds.map(String) : []).filter((id: string) => valid.has(id));
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

  let meetLink: string | null = null, eventsJson: string | null = null, zohoJson: string | null = null;
  try {
    const { meetLink: ml, events } = await createMeetingForMembers({ memberIds, clientEmail: guest, summary: title, description: baseDesc, startISO, endISO });
    meetLink = ml; if (events.length) eventsJson = JSON.stringify(events);
  } catch { /* keep going */ }
  try { const z = await createZohoForMembers({ memberIds, summary: title, description: baseDesc, startISO, endISO, meetLink }); if (z.length) zohoJson = JSON.stringify(z); } catch { /* ignore */ }

  const cancelToken = randomBytes(18).toString("hex");
  const booking = await createBooking({
    meeting_type_id: null, member_ids: memberIds,
    client_name: clientName || "Guest", client_email: guest || "", client_notes: notes, client_timezone: null,
    start_utc: startISO, end_utc: endISO, google_event_id: eventsJson, meet_link: meetLink, cancel_token: cancelToken,
  });

  // Email the guest their invite (if an email was given).
  try {
    const key = process.env.RESEND_API_KEY;
    if (key && guest) {
      const from = process.env.CONTACT_FROM_EMAIL || "Avloryn Labs <onboarding@resend.dev>";
      const when = new Date(startMs).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full", timeStyle: "short" });
      const ics = buildICS({ uid: booking.id, startISO, endISO, summary: `${title} — Avloryn Labs`, description: (meetLink ? `Join Google Meet: ${meetLink}\n\n` : "") + baseDesc, location: meetLink || "Online", organizerName: "Avloryn Labs", organizerEmail: memberEmails[0] || undefined, attendeeEmails: [guest, ...memberEmails] });
      await new Resend(key).emails.send({
        from, to: guest, subject: `Invitation: ${title} with Avloryn Labs`,
        text: `Hi ${clientName || "there"},\n\nYou're invited to ${title}.\n\nWhen: ${when}\nWith: ${memberNames || "Avloryn Labs"}\n` + (meetLink ? `Join (Google Meet): ${meetLink}\n` : "") + `\nThe attached invite adds it to your calendar.\n\nReschedule: ${SITE_URL}/meet/reschedule?t=${cancelToken}\nCancel: ${SITE_URL}/meet/cancel?t=${cancelToken}\n\n— Avloryn Labs`,
        attachments: [{ filename: "invite.ics", content: Buffer.from(ics).toString("base64") }],
      });
    }
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, meetLink, cancelToken, bookingId: booking.id, invited: !!guest });
}
