import { NextResponse } from "next/server";
import { Resend } from "resend";
import { canSchedule } from "@/lib/booking/admin";
import {
  listBookings, listMeetingTypes, listMembers, getBookingById, getMeetingTypeById,
  markBookingCancelled, setBookingAttendance, confirmBooking,
} from "@/lib/booking/db";
import { deleteMeetingEvents, createMeetingForMembers, type MemberEvent } from "@/lib/booking/google";
import { deleteZohoEvents, createZohoForMembers, type ZohoEvent } from "@/lib/booking/zoho";
import { buildICS } from "@/lib/booking/ics";
import { meetingCancelledHTML, whenIST } from "@/lib/booking/email";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deny = () => NextResponse.json({ error: "Not authorized" }, { status: 401 });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(req: Request) {
  if (!(await canSchedule())) return deny();
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status") || undefined;
  const [bookings, types, members] = await Promise.all([
    listBookings({ status, from: sp.get("from") || undefined, to: sp.get("to") || undefined }),
    listMeetingTypes(),
    listMembers(),
  ]);
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const memberName = new Map(members.map((m) => [m.id, m.name]));
  const rows = bookings.map((b) => ({
    ...b,
    meetingTypeName: typeName.get(b.meeting_type_id || "") || "—",
    memberNames: b.member_ids.map((id) => memberName.get(id) || "—"),
  }));
  return NextResponse.json({ bookings: rows });
}

// Admin actions: cancel a booking, or mark attendance (attended / no-show).
export async function PATCH(req: Request) {
  if (!(await canSchedule())) return deny();
  const d = await req.json().catch(() => ({}));
  const id = String(d.id || "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const b = await getBookingById(id);
  if (!b) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  if (d.action === "cancel") {
    if (b.google_event_id) {
      try { const p = JSON.parse(b.google_event_id) as MemberEvent[]; if (Array.isArray(p)) await deleteMeetingEvents(p); } catch { /* legacy/none */ }
    }
    if (b.zoho_event_id) {
      try { const z = JSON.parse(b.zoho_event_id) as ZohoEvent[]; if (Array.isArray(z)) await deleteZohoEvents(z); } catch { /* ignore */ }
    }
    await markBookingCancelled(id);
    // Notify everyone — client + attending members (branded).
    try {
      const key = process.env.RESEND_API_KEY;
      if (key) {
        const mt = b.meeting_type_id ? await getMeetingTypeById(b.meeting_type_id) : null;
        const members = await listMembers();
        const byId = new Map(members.map((m) => [m.id, m]));
        const memberNames = b.member_ids.map((mid) => byId.get(mid)?.name).filter(Boolean).join(", ");
        const from = process.env.CONTACT_FROM_EMAIL || "Avloryn Labs <onboarding@resend.dev>";
        const title = mt?.name || "Meeting";
        const clientWhen = new Date(b.start_utc).toLocaleString("en-IN", { timeZone: b.client_timezone || "Asia/Kolkata", dateStyle: "full", timeStyle: "short" });
        const rz = new Resend(key);
        if (b.client_email && EMAIL_RE.test(b.client_email)) {
          await rz.emails.send({ from, to: b.client_email, subject: `Cancelled: ${title} with Avloryn Labs`,
            html: meetingCancelledHTML({ title, whenText: clientWhen, withNames: memberNames || "Avloryn Labs", greetingName: (b.client_name || "").split(" ")[0] || undefined }),
            text: `Your ${title} on ${clientWhen} has been cancelled and removed from the calendar. — Avloryn Labs` });
        }
        for (const mid of b.member_ids) {
          const em = byId.get(mid)?.email;
          if (!em || !EMAIL_RE.test(em)) continue;
          await rz.emails.send({ from, to: em, subject: `Cancelled: ${title}${b.client_name ? ` with ${b.client_name}` : ""}`,
            html: meetingCancelledHTML({ title, whenText: whenIST(b.start_utc), withNames: b.client_name || "—", greetingName: (byId.get(mid)?.name || "").split(" ")[0] || undefined }),
            text: `${title}${b.client_name ? ` with ${b.client_name}` : ""} on ${whenIST(b.start_utc)} has been cancelled and removed from the calendar.` });
        }
      }
    } catch { /* best-effort */ }
    return NextResponse.json({ ok: true });
  }
  if (d.action === "attendance") {
    const a = d.attendance === "attended" ? "attended" : d.attendance === "no_show" ? "no_show" : null;
    await setBookingAttendance(id, a);
    return NextResponse.json({ ok: true });
  }
  if (d.action === "approve") {
    if (b.status !== "pending") return NextResponse.json({ error: "Not a pending booking" }, { status: 400 });
    const mt = b.meeting_type_id ? await getMeetingTypeById(b.meeting_type_id) : null;
    const members = await listMembers();
    const byId = new Map(members.map((m) => [m.id, m]));
    let hostOrder = b.member_ids.slice();
    if (mt?.organizer_id && hostOrder.includes(mt.organizer_id)) hostOrder = [mt.organizer_id, ...hostOrder.filter((id) => id !== mt.organizer_id)];
    const memberEmails = b.member_ids.map((mid) => byId.get(mid)?.email).filter(Boolean) as string[];
    const memberNames = b.member_ids.map((mid) => byId.get(mid)?.name).filter(Boolean).join(", ");
    const title = mt?.name || "Meeting";
    const baseDesc = `${title} with ${b.client_name} (${b.client_email}).`;

    let meetLink: string | null = null, eventsJson: string | null = null, zohoJson: string | null = null;
    try {
      const { meetLink: ml, events } = await createMeetingForMembers({ memberIds: hostOrder, clientEmail: b.client_email, summary: `${title} — ${b.client_name}`, description: baseDesc, startISO: b.start_utc, endISO: b.end_utc });
      meetLink = ml; if (events.length) eventsJson = JSON.stringify(events);
    } catch { /* keep going */ }
    try { const z = await createZohoForMembers({ memberIds: b.member_ids, summary: `${title} — ${b.client_name}`, description: baseDesc, startISO: b.start_utc, endISO: b.end_utc, meetLink }); if (z.length) zohoJson = JSON.stringify(z); } catch { /* ignore */ }
    await confirmBooking(id, { google_event_id: eventsJson, meet_link: meetLink, zoho_event_id: zohoJson });

    try {
      const key = process.env.RESEND_API_KEY;
      if (key && EMAIL_RE.test(b.client_email)) {
        const from = process.env.CONTACT_FROM_EMAIL || "Avloryn Labs <onboarding@resend.dev>";
        const when = new Date(b.start_utc).toLocaleString("en-IN", { timeZone: b.client_timezone || "Asia/Kolkata", dateStyle: "full", timeStyle: "short" });
        const ics = buildICS({ uid: b.id, startISO: b.start_utc, endISO: b.end_utc, summary: `${title} — Avloryn Labs`, description: (meetLink ? `Join Google Meet: ${meetLink}\n\n` : "") + baseDesc, location: meetLink || "Online", organizerName: "Avloryn Labs", organizerEmail: memberEmails[0] || undefined, attendeeEmails: [b.client_email, ...memberEmails] });
        await new Resend(key).emails.send({
          from, to: b.client_email, subject: `Confirmed: ${title} with Avloryn Labs`,
          text: `Hi ${b.client_name},\n\nGood news — your ${title} is confirmed.\n\nWhen: ${when}\nWith: ${memberNames || "Avloryn Labs"}\n` + (meetLink ? `Join (Google Meet): ${meetLink}\n` : "") + `\nReschedule: ${SITE_URL}/meet/reschedule?t=${b.cancel_token}\nCancel: ${SITE_URL}/meet/cancel?t=${b.cancel_token}\n\n— Avloryn Labs`,
          attachments: [{ filename: "invite.ics", content: Buffer.from(ics).toString("base64") }],
        });
      }
    } catch { /* best-effort */ }
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
