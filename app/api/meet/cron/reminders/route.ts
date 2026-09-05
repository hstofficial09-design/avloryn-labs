import { NextResponse } from "next/server";
import { Resend } from "resend";
import {
  bookingsNeedingAnyReminder, bookingsNeedingFollowup, markReminderSent, markFollowedUp,
  listMeetingTypes, listMembers, storedTitle,
} from "@/lib/booking/db";
import { meetingInviteHTML, whenIST } from "@/lib/booking/email";
import { syncCalendarChanges } from "@/lib/booking/sync";
import { beat } from "@/lib/monitor/state";
import { SITE_URL } from "@/lib/seo";
import { threadHeaders, guestSubject, teamSubject } from "@/lib/booking/thread";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/**
 * How close to the meeting a reminder is still worth sending.
 *
 * This used to be a 20-minute window tied to the cron's cadence: a reminder went out only if the
 * run happened to land within 20 minutes of the offset, and otherwise the offset was marked
 * handled and silently skipped. That assumed the schedule was punctual. Measured over 40 runs,
 * GitHub's scheduler fired a "every 15 minutes" job every 50 minutes on average and once left a
 * five-hour gap — so most reminders were falling between runs and never being sent at all.
 *
 * Usefulness is the right test, not punctuality: send it however late the run is, as long as there
 * is still enough time before the meeting for it to be worth reading. Anything later than this is
 * still marked handled, so a stale reminder never arrives after the fact.
 */
const MIN_USEFUL_LEAD = 10;

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

  // ── First: pick up anything moved directly in Google Calendar, so the rest of this run (and
  //    every reminder it sends) works from the real time rather than a stale one. ──
  let synced = { checked: 0, moved: 0 };
  try {
    synced = await syncCalendarChanges();
  } catch (e) { console.error("[cron] calendar sync failed:", e); }

  // ── Reminders: at each offset the meeting type configured (default 2h), to the client
  //    AND every attending member. Fires the most imminent still-fresh one per run. ──
  for (const b of await bookingsNeedingAnyReminder(1600)) {
    try {
      const t = typeById.get(b.meeting_type_id || "");
      const mTitle = t?.name || storedTitle(b) || "your meeting";
      const offsets = ((t?.reminders && t.reminders.length ? t.reminders : [120]) as number[]).filter((n) => Number.isFinite(n) && n > 0);
      const sent: number[] = Array.isArray(b.reminders_sent) ? b.reminders_sent : [];
      // Where per-offset tracking isn't available, a single reminded_at is all we have — treat it
      // as "already reminded" so the same reminder cannot go out again on every run.
      if (!Array.isArray(b.reminders_sent) && b.reminded_at) continue;
      const mins = (Date.parse(b.start_utc) - Date.now()) / 60000;
      const crossed = offsets.filter((o) => !sent.includes(o) && mins <= o);
      if (!crossed.length) continue;
      // Email only the most imminent still-fresh offset; mark every crossed one handled
      // (a long-missed offset is marked without spamming a stale reminder).
      const fresh = crossed.filter(() => mins >= MIN_USEFUL_LEAD);
      const toEmail = fresh.length ? Math.min(...fresh) : null;
      // Record it BEFORE sending. If we can't record it we must not send at all: an unrecorded
      // reminder goes out again on the next run, and the next, every 15 minutes.
      if (!(await markReminderSent(b.id, Array.from(new Set([...sent, ...crossed]))))) continue;
      if (toEmail != null && resend) {
        const withWho = b.member_ids.map((id) => memberName.get(id)).filter(Boolean).join(", ");
        const clientWhen = new Date(b.start_utc).toLocaleString("en-IN", { timeZone: b.client_timezone || "Asia/Kolkata", dateStyle: "full", timeStyle: "short" });
        const rescheduleUrl = `${SITE_URL}/meet/reschedule?t=${b.cancel_token}`, cancelUrl = `${SITE_URL}/meet/cancel?t=${b.cancel_token}`;
        const label = toEmail >= 1440 ? `${Math.round(toEmail / 1440)} day${toEmail >= 2880 ? "s" : ""}` : toEmail >= 60 ? `${Math.round(toEmail / 60)} hour${toEmail >= 120 ? "s" : ""}` : `${toEmail} min`;
        if (b.client_email && EMAIL_RE.test(b.client_email)) {
          await resend.emails.send({
            from, to: b.client_email, subject: guestSubject(mTitle), headers: threadHeaders(b.id),
            html: meetingInviteHTML({ heading: `Reminder · in ${label}`, title: mTitle, whenText: clientWhen, withNames: withWho || "Avloryn Labs", greetingName: (b.client_name || "").split(" ")[0] || undefined, meetLink: b.meet_link, rescheduleUrl, cancelUrl }),
            text: `Reminder: ${mTitle} in ${label}.\nWhen: ${clientWhen}\n${b.meet_link ? `Join: ${b.meet_link}\n` : ""}Reschedule: ${rescheduleUrl}\nCancel: ${cancelUrl}`,
          });
        }
        for (const id of b.member_ids) {
          const em = memberEmail.get(id);
          if (!em || !EMAIL_RE.test(em)) continue;
          await resend.emails.send({
            from, to: em, subject: teamSubject(mTitle, b.client_name), headers: threadHeaders(b.id),
            html: meetingInviteHTML({ heading: `Reminder · in ${label}`, title: mTitle, whenText: whenIST(b.start_utc), withNames: b.client_name || "—", greetingName: (memberName.get(id) || "").split(" ")[0] || undefined, meetLink: b.meet_link, rescheduleUrl, cancelUrl }),
            text: `Reminder: ${mTitle} with ${b.client_name} in ${label}. ${b.meet_link ? "Join: " + b.meet_link : ""}`,
          });
        }
        reminders++;
      }
    } catch (e) { console.error("[reminders] booking skipped:", e); }
  }

  // ── Post-meeting follow-up (only if the meeting type opted in) ──
  for (const b of await bookingsNeedingFollowup()) {
    try {
      const t = typeById.get(b.meeting_type_id || "");
      if (t?.followup_enabled && resend && b.client_email) {
        await resend.emails.send({
          from, to: b.client_email,
          subject: guestSubject(typeById.get(b.meeting_type_id || "")?.name || "Meeting"),
          headers: threadHeaders(b.id),
          text:
            `Hi ${b.client_name},\n\nThank you for your time today. It was great connecting.\n\n` +
            `If anything came up that we can help with, just reply to this email.\n\n— Avloryn Labs`,
        });
        followups++;
      }
      await markFollowedUp(b.id); // mark either way so it isn't reconsidered
    } catch { /* skip */ }
  }

  // "I ran." The dead-man's switch: this job once sat dead for weeks — its scheduler lived on a
  // host the site had moved off — and nothing said so, because a job that is not running cannot
  // report its own failure. The watchdog reads this timestamp and alerts on the SILENCE instead.
  // Recorded at the end, so a run that throws half way through never counts as a healthy one.
  try {
    await beat("meet-reminders", `${reminders} reminder(s), ${followups} follow-up(s)`);
  } catch { /* recording the beat must never break the run that earned it */ }

  return { reminders, followups, checked: synced.checked, resynced: synced.moved };
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await run()) });
}
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await run()) });
}
