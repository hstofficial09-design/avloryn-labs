import { NextResponse } from "next/server";
import { Resend } from "resend";
import {
  bookingsNeedingReminder, bookingsNeedingFollowup, markReminded, markFollowedUp,
  listMeetingTypes, listMembers,
} from "@/lib/booking/db";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called by the Netlify scheduled function (every ~15 min). Guarded by CRON_SECRET.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  return req.headers.get("x-cron-secret") === secret || url.searchParams.get("key") === secret;
}

async function run() {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM_EMAIL || "Avloryn Labs <onboarding@resend.dev>";
  const resend = key ? new Resend(key) : null;
  const [types, members] = await Promise.all([listMeetingTypes(), listMembers()]);
  const typeById = new Map(types.map((t) => [t.id, t]));
  const memberName = new Map(members.map((m) => [m.id, m.name]));

  let reminders = 0, followups = 0;

  // ── Reminders: ~2h before start ──
  for (const b of await bookingsNeedingReminder(120)) {
    try {
      const t = typeById.get(b.meeting_type_id || "");
      const when = new Date(b.start_utc).toLocaleString("en-IN", { timeZone: b.client_timezone || "Asia/Kolkata", dateStyle: "full", timeStyle: "short" });
      const withWho = b.member_ids.map((id) => memberName.get(id)).filter(Boolean).join(", ");
      if (resend && b.client_email) {
        await resend.emails.send({
          from, to: b.client_email,
          subject: `Reminder: ${t?.name || "your meeting"} soon`,
          text:
            `Hi ${b.client_name},\n\nA quick reminder about your ${t?.name || "meeting"}.\n\n` +
            `When: ${when}\nWith: ${withWho || "Avloryn Labs"}\n` +
            (b.meet_link ? `Join (Google Meet): ${b.meet_link}\n` : "") +
            `\nReschedule: ${SITE_URL}/meet/reschedule?t=${b.cancel_token}\nCancel: ${SITE_URL}/meet/cancel?t=${b.cancel_token}\n\n— Avloryn Labs`,
        });
      }
      await markReminded(b.id);
      reminders++;
    } catch { /* skip this one */ }
  }

  // ── Post-meeting follow-up (only if the meeting type opted in) ──
  for (const b of await bookingsNeedingFollowup()) {
    try {
      const t = typeById.get(b.meeting_type_id || "");
      if (t?.followup_enabled && resend && b.client_email) {
        await resend.emails.send({
          from, to: b.client_email,
          subject: `Thanks for meeting with Avloryn Labs`,
          text:
            `Hi ${b.client_name},\n\nThank you for your time today. It was great connecting.\n\n` +
            `If anything came up that we can help with, just reply to this email.\n\n— Avloryn Labs`,
        });
        followups++;
      }
      await markFollowedUp(b.id); // mark either way so it isn't reconsidered
    } catch { /* skip */ }
  }

  return { reminders, followups };
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await run()) });
}
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await run()) });
}
