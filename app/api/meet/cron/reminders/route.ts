import { NextResponse } from "next/server";
import { Resend } from "resend";
import {
  bookingsNeedingAnyReminder, bookingsNeedingFollowup, markReminderSent, markFollowedUp,
  listMeetingTypes, listMembers,
} from "@/lib/booking/db";
import { meetingInviteHTML, whenIST } from "@/lib/booking/email";
import { SITE_URL } from "@/lib/seo";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CRON_WINDOW = 20; // the scheduled function runs ~every 15 min

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
  const memberEmail = new Map(members.map((m) => [m.id, m.email]));

  let reminders = 0, followups = 0;

  // ── Reminders: at each offset the meeting type configured (default 2h), to the client
  //    AND every attending member. Fires the most imminent still-fresh one per run. ──
  for (const b of await bookingsNeedingAnyReminder(1600)) {
    try {
      const t = typeById.get(b.meeting_type_id || "");
      const offsets = ((t?.reminders && t.reminders.length ? t.reminders : [120]) as number[]).filter((n) => Number.isFinite(n) && n > 0);
      const sent: number[] = Array.isArray(b.reminders_sent) ? b.reminders_sent : [];
      const mins = (Date.parse(b.start_utc) - Date.now()) / 60000;
      const crossed = offsets.filter((o) => !sent.includes(o) && mins <= o);
      if (!crossed.length) continue;
      // Email only the most imminent still-fresh offset; mark every crossed one handled
      // (a long-missed offset is marked without spamming a stale reminder).
      const fresh = crossed.filter((o) => mins > o - CRON_WINDOW);
      const toEmail = fresh.length ? Math.min(...fresh) : null;
      if (toEmail != null && resend) {
        const withWho = b.member_ids.map((id) => memberName.get(id)).filter(Boolean).join(", ");
        const clientWhen = new Date(b.start_utc).toLocaleString("en-IN", { timeZone: b.client_timezone || "Asia/Kolkata", dateStyle: "full", timeStyle: "short" });
        const rescheduleUrl = `${SITE_URL}/meet/reschedule?t=${b.cancel_token}`, cancelUrl = `${SITE_URL}/meet/cancel?t=${b.cancel_token}`;
        const label = toEmail >= 1440 ? `${Math.round(toEmail / 1440)} day${toEmail >= 2880 ? "s" : ""}` : toEmail >= 60 ? `${Math.round(toEmail / 60)} hour${toEmail >= 120 ? "s" : ""}` : `${toEmail} min`;
        if (b.client_email && EMAIL_RE.test(b.client_email)) {
          await resend.emails.send({
            from, to: b.client_email, subject: `Reminder: ${t?.name || "your meeting"} in ${label}`,
            html: meetingInviteHTML({ heading: `Reminder · in ${label}`, title: t?.name || "Your meeting", whenText: clientWhen, withNames: withWho || "Avloryn Labs", greetingName: (b.client_name || "").split(" ")[0] || undefined, meetLink: b.meet_link, rescheduleUrl, cancelUrl }),
            text: `Reminder: ${t?.name || "your meeting"} in ${label}.\nWhen: ${clientWhen}\n${b.meet_link ? `Join: ${b.meet_link}\n` : ""}Reschedule: ${rescheduleUrl}\nCancel: ${cancelUrl}`,
          });
        }
        for (const id of b.member_ids) {
          const em = memberEmail.get(id);
          if (!em || !EMAIL_RE.test(em)) continue;
          await resend.emails.send({
            from, to: em, subject: `Reminder: ${t?.name || "meeting"} with ${b.client_name} in ${label}`,
            html: meetingInviteHTML({ heading: `Reminder · in ${label}`, title: t?.name || "Meeting", whenText: whenIST(b.start_utc), withNames: b.client_name || "—", greetingName: (memberName.get(id) || "").split(" ")[0] || undefined, meetLink: b.meet_link, rescheduleUrl, cancelUrl }),
            text: `Reminder: ${t?.name || "meeting"} with ${b.client_name} in ${label}. ${b.meet_link ? "Join: " + b.meet_link : ""}`,
          });
        }
        reminders++;
      }
      await markReminderSent(b.id, Array.from(new Set([...sent, ...crossed])));
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
