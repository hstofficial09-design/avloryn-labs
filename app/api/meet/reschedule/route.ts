import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getBookingByCancelToken, getMeetingTypeById, updateBookingTime, listMembers } from "@/lib/booking/db";
import { moveMeetingEvents, type MemberEvent } from "@/lib/booking/google";
import { moveZohoEvents, type ZohoEvent } from "@/lib/booking/zoho";
import { buildICS } from "@/lib/booking/ics";
import { meetingInviteHTML, whenIST } from "@/lib/booking/email";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Summary for the reschedule page: what the client is moving + which meeting type to load slots for.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t") || "";
  const b = await getBookingByCancelToken(token);
  if (!b) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (b.status === "cancelled") return NextResponse.json({ error: "This booking was cancelled" }, { status: 410 });
  const mt = b.meeting_type_id ? await getMeetingTypeById(b.meeting_type_id) : null;
  const durationMin = Math.round((Date.parse(b.end_utc) - Date.parse(b.start_utc)) / 60000);
  return NextResponse.json({
    slug: mt?.slug || null,
    name: mt?.name || "Meeting",
    currentStartISO: b.start_utc,
    durationMin,
    memberIds: b.member_ids,
    clientName: b.client_name,
  });
}

export async function POST(req: Request) {
  const d = await req.json().catch(() => ({}));
  const b = await getBookingByCancelToken(String(d.token || ""));
  if (!b) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (b.status === "cancelled") return NextResponse.json({ error: "This booking was cancelled" }, { status: 410 });

  const startMs = Date.parse(String(d.startISO || ""));
  if (Number.isNaN(startMs)) return NextResponse.json({ error: "Invalid time" }, { status: 400 });
  if (startMs < Date.now()) return NextResponse.json({ error: "That time is in the past" }, { status: 400 });

  const durationMs = Date.parse(b.end_utc) - Date.parse(b.start_utc);
  const startISO = new Date(startMs).toISOString();
  const endISO = new Date(startMs + durationMs).toISOString();

  // Move the calendar events (keeps the same Meet link) then update our record.
  if (b.google_event_id) {
    let events: MemberEvent[] | null = null;
    try { const p = JSON.parse(b.google_event_id); if (Array.isArray(p)) events = p; } catch { /* legacy/none */ }
    if (events) await moveMeetingEvents(events, startISO, endISO);
  }
  if (b.zoho_event_id) {
    try { const z = JSON.parse(b.zoho_event_id) as ZohoEvent[]; if (Array.isArray(z)) await moveZohoEvents(z, startISO, endISO); } catch { /* ignore */ }
  }
  await updateBookingTime(b.id, startISO, endISO);

  // Re-send with the new time + a fresh .ics — to the client AND every attending member (branded).
  try {
    const key = process.env.RESEND_API_KEY;
    if (key) {
      const mt = b.meeting_type_id ? await getMeetingTypeById(b.meeting_type_id) : null;
      const members = await listMembers();
      const byId = new Map(members.map((m) => [m.id, m]));
      const memberEmails = b.member_ids.map((id) => byId.get(id)?.email).filter(Boolean) as string[];
      const memberNames = b.member_ids.map((id) => byId.get(id)?.name).filter(Boolean).join(", ");
      const from = process.env.CONTACT_FROM_EMAIL || "Avloryn Labs <onboarding@resend.dev>";
      const title = mt?.name || "Meeting";
      const clientWhen = new Date(startMs).toLocaleString("en-IN", { timeZone: b.client_timezone || "Asia/Kolkata", dateStyle: "full", timeStyle: "short" });
      const cancelUrl = `${SITE_URL}/meet/cancel?t=${b.cancel_token}`;
      const rescheduleUrl = `${SITE_URL}/meet/reschedule?t=${b.cancel_token}`;
      const ics = buildICS({
        uid: b.id, startISO, endISO,
        summary: `${title} — Avloryn Labs`,
        description: (b.meet_link ? `Join Google Meet: ${b.meet_link}\n\n` : "") + `${title} with ${memberNames || "Avloryn Labs"}.`,
        location: b.meet_link || "Online",
        organizerName: "Avloryn Labs", organizerEmail: memberEmails[0] || undefined,
        attendeeEmails: [b.client_email, ...memberEmails].filter(Boolean),
      });
      const attachments = [{ filename: "invite.ics", content: Buffer.from(ics).toString("base64") }];
      const rz = new Resend(key);

      if (EMAIL_RE.test(b.client_email)) {
        await rz.emails.send({
          from, to: b.client_email, subject: `Rescheduled: ${title} with Avloryn Labs`,
          html: meetingInviteHTML({ heading: "Rescheduled · new time", title, whenText: clientWhen, withNames: memberNames || "Avloryn Labs", greetingName: (b.client_name || "").split(" ")[0] || undefined, meetLink: b.meet_link, rescheduleUrl, cancelUrl }),
          text: `Your ${title} has moved.\nNew time: ${clientWhen}\nWith: ${memberNames || "Avloryn Labs"}\n${b.meet_link ? `Join: ${b.meet_link}\n` : ""}Reschedule: ${rescheduleUrl}\nCancel: ${cancelUrl}`,
          attachments,
        });
      }
      for (const id of b.member_ids) {
        const em = byId.get(id)?.email;
        if (!em || !EMAIL_RE.test(em)) continue;
        await rz.emails.send({
          from, to: em, subject: `Rescheduled: ${title}${b.client_name ? ` with ${b.client_name}` : ""}`,
          html: meetingInviteHTML({ heading: "Rescheduled · new time", title, whenText: whenIST(startISO), withNames: b.client_name || "—", greetingName: (byId.get(id)?.name || "").split(" ")[0] || undefined, meetLink: b.meet_link, rescheduleUrl, cancelUrl }),
          text: `${title}${b.client_name ? ` with ${b.client_name}` : ""} moved to ${whenIST(startISO)}. ${b.meet_link ? "Join: " + b.meet_link : ""}`,
          attachments,
        });
      }
    }
  } catch {
    /* email best-effort */
  }

  return NextResponse.json({ ok: true, startISO, endISO, meetLink: b.meet_link });
}
