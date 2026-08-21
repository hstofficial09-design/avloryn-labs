/**
 * The checks themselves — everything that can break QUIETLY.
 *
 * Loud breakage looks after itself: a page that 500s gets reported within the hour. These are the
 * failures where the screen still looks fine. A Google grant is revoked and meetings stop landing
 * in someone's diary. A cron stops running and reminders stop going out. Somebody leaves and their
 * referral code keeps paying. Nothing on any dashboard changes, so nobody finds out until a
 * customer, a payout or a missed meeting makes it obvious — usually weeks later.
 *
 * Rules for anything added here:
 *   · READ-ONLY. Never writes, never books, never sends. A watchdog that changes things is a bug
 *     factory, and one that can act on production is a security hole.
 *   · Each check is independently guarded. One failing check must never stop the rest from running,
 *     because the run that breaks is exactly the run you needed.
 *   · Never guess. A check that cannot be established reports `ok: null`, which is treated as a
 *     fault, not a pass. Optimism here means silence when it matters most.
 *   · Only alert on something a person would actually act on. Every needless alert makes the real
 *     one less likely to be read.
 */
import { listMembers, listUpcomingConfirmed, membersWithGoogle, membersWithZoho } from "@/lib/booking/db";
import { verifyMemberGoogle, googleConfigured, readMeetingTimes, type MemberEvent } from "@/lib/booking/google";
import { verifyMemberZoho, zohoConfigured, readZohoTimes, type ZohoEvent } from "@/lib/booking/zoho";
import { getPool } from "@/lib/portal-db";
import type { CheckResult } from "./state";

const ok = (id: string, title: string, detail: string, severity: "critical" | "warn" = "critical"): CheckResult =>
  ({ id, app: "Avloryn", title, ok: true, severity, detail });
const bad = (id: string, title: string, detail: string, severity: "critical" | "warn" = "critical"): CheckResult =>
  ({ id, app: "Avloryn", title, ok: false, severity, detail });
const unknown = (id: string, title: string, detail: string, severity: "critical" | "warn" = "critical"): CheckResult =>
  ({ id, app: "Avloryn", title, ok: null, severity, detail });

/** Run one check without letting it take the others down with it. */
async function attempt(id: string, title: string, fn: () => Promise<CheckResult>, severity: "critical" | "warn" = "critical"): Promise<CheckResult> {
  try {
    return await fn();
  } catch (e: any) {
    return unknown(id, title, `check could not run: ${e?.message || e}`.slice(0, 300), severity);
  }
}

const parseEvents = <T,>(raw: string | null | undefined): T[] => {
  if (!raw) return [];
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
};

/** A calendar time this far from our record is rounding, not a real disagreement. */
const DRIFT_TOLERANCE_MS = 60_000;

export async function runAvlorynChecks(): Promise<CheckResult[]> {
  const out: CheckResult[] = [];

  // ── the two databases ─────────────────────────────────────────────────────────────────────
  out.push(await attempt("db.scheduling", "Scheduling database reachable", async () => {
    const members = await listMembers();
    // listMembers returns [] both when Supabase is down and when there is genuinely nobody — and
    // an empty team means no booking link works at all, so either way it needs saying.
    if (!members.length) return bad("db.scheduling", "Scheduling database reachable", "no team members came back — Supabase is unreachable or the team is empty");
    return ok("db.scheduling", "Scheduling database reachable", `${members.length} member(s)`);
  }));

  out.push(await attempt("db.portal", "Company database reachable", async () => {
    const p = getPool();
    if (!p) return bad("db.portal", "Company database reachable", "LIVODRAFT_DATABASE_URL is not set — team, commissions and network are all offline");
    const c = await p.connect();
    try { await c.query("SELECT 1"); } finally { c.release(); }
    return ok("db.portal", "Company database reachable", "connected");
  }));

  // ── calendars ─────────────────────────────────────────────────────────────────────────────
  // The one that has actually bitten: a grant is revoked (password change, security review, an
  // app removed from a Google account) and every future meeting silently stops appearing in that
  // person's diary. Booking keeps succeeding, so nothing looks wrong until they miss a call.
  out.push(await attempt("calendar.connections", "Calendar connections still work", async () => {
    const members = (await listMembers()).filter((m) => m.active);
    if (!members.length) return unknown("calendar.connections", "Calendar connections still work", "no active members to check");
    const ids = members.map((m) => m.id);
    const [hasG, hasZ] = await Promise.all([membersWithGoogle(ids), membersWithZoho(ids)]);
    const broken: string[] = [];
    await Promise.all(members.map(async (m) => {
      const [gOk, zOk] = await Promise.all([
        hasG.has(m.id) ? verifyMemberGoogle(m.id) : Promise.resolve(null),
        hasZ.has(m.id) ? verifyMemberZoho(m.id) : Promise.resolve(null),
      ]);
      // Only a connection that EXISTS and has stopped working is a fault. Never having connected
      // is a different matter, reported separately below.
      if (gOk === false) broken.push(`${m.name} · Google`);
      if (zOk === false) broken.push(`${m.name} · Zoho`);
    }));
    return broken.length
      ? bad("calendar.connections", "Calendar connections still work",
            `${broken.join(", ")} — meetings are no longer reaching ${broken.length > 1 ? "these calendars" : "this calendar"}; reconnect from Scheduling → Team`)
      : ok("calendar.connections", "Calendar connections still work", `${members.length} member(s), all connections valid`);
  }));

  // Someone bookable with no calendar at all gets meetings that exist only in our records.
  out.push(await attempt("calendar.missing", "Every bookable person has a calendar", async () => {
    const members = (await listMembers()).filter((m) => m.active);
    if (!members.length) return unknown("calendar.missing", "Every bookable person has a calendar", "no active members");
    const ids = members.map((m) => m.id);
    const [hasG, hasZ] = await Promise.all([membersWithGoogle(ids), membersWithZoho(ids)]);
    const none = members.filter((m) => !hasG.has(m.id) && !hasZ.has(m.id)).map((m) => m.name);
    return none.length
      ? bad("calendar.missing", "Every bookable person has a calendar",
            `${none.join(", ")} — bookable but nothing lands in their diary`, "warn")
      : ok("calendar.missing", "Every bookable person has a calendar", "all connected", "warn");
  }, "warn"));

  out.push(await attempt("calendar.configured", "Google and Zoho are configured", async () => {
    const g = googleConfigured(), z = zohoConfigured();
    return g && z
      ? ok("calendar.configured", "Google and Zoho are configured", "both configured")
      : bad("calendar.configured", "Google and Zoho are configured",
            `${!g ? "Google" : ""}${!g && !z ? " and " : ""}${!z ? "Zoho" : ""} credentials are missing — nobody can connect or reconnect`);
  }));

  // ── meetings we believe in that nobody's calendar knows about ──────────────────────────────
  // If an event is deleted straight from a calendar, our record survives: the reschedule link
  // still works, reminders still go out, and it still blocks the slot — for a meeting that is in
  // nobody's diary. Also catches the sync silently failing to read anything back.
  out.push(await attempt("booking.orphans", "Upcoming meetings exist on a calendar", async () => {
    const bookings = (await listUpcomingConfirmed()).slice(0, 12);
    if (!bookings.length) return ok("booking.orphans", "Upcoming meetings exist on a calendar", "nothing upcoming");
    const missing: string[] = [], drifted: string[] = [];
    for (const b of bookings) {
      const g = parseEvents<MemberEvent>(b.google_event_id);
      const z = parseEvents<ZohoEvent>((b as any).zoho_event_id ?? null);
      if (!g.length && !z.length) { missing.push(`${b.client_name || "meeting"} (never placed)`); continue; }
      const [gt, zt] = await Promise.all([
        g.length ? readMeetingTimes(g) : Promise.resolve([]),
        z.length ? readZohoTimes(z) : Promise.resolve([]),
      ]);
      const times = [...gt, ...zt].filter((t) => t.startISO);
      if (!times.length) { missing.push(b.client_name || b.id.slice(0, 8)); continue; }
      // The sync brings copies back into line every 15 minutes, so a lasting disagreement means
      // the sync is not doing its job.
      const stored = Date.parse(b.start_utc);
      if (times.every((t) => Math.abs(Date.parse(t.startISO!) - stored) > DRIFT_TOLERANCE_MS)) {
        drifted.push(b.client_name || b.id.slice(0, 8));
      }
    }
    if (missing.length) return bad("booking.orphans", "Upcoming meetings exist on a calendar",
      `${missing.join(", ")} — in our records but on nobody's calendar; reminders will still go out`);
    if (drifted.length) return bad("booking.orphans", "Upcoming meetings exist on a calendar",
      `${drifted.join(", ")} — the calendar time no longer matches our record and the sync has not corrected it`);
    return ok("booking.orphans", "Upcoming meetings exist on a calendar", `${bookings.length} checked, all present`);
  }));

  // A member removed from scheduling while still attending a booking leaves a meeting with a
  // participant who no longer exists — no reminder, no calendar copy, no way to reach them.
  out.push(await attempt("booking.ghost_members", "Meetings have no missing attendees", async () => {
    const [bookings, members] = await Promise.all([listUpcomingConfirmed(), listMembers()]);
    const live = new Set(members.map((m) => m.id));
    const ghosts = bookings.filter((b) => (b.member_ids || []).some((id) => !live.has(id)));
    return ghosts.length
      ? bad("booking.ghost_members", "Meetings have no missing attendees",
            `${ghosts.length} upcoming meeting(s) list somebody who is no longer on the team`, "warn")
      : ok("booking.ghost_members", "Meetings have no missing attendees", `${bookings.length} upcoming meeting(s) clean`, "warn");
  }, "warn"));

  // ── one delete must reach every system ────────────────────────────────────────────────────
  // The company database and the scheduling database know nothing about each other. Removing
  // somebody in the portal is supposed to deactivate their scheduling member too. When that half
  // runs, the person is gone from every screen but still bookable — this is the check that caught
  // it before, and the one that will catch it again.
  out.push(await attempt("link.leaver_bookable", "Removed people are not still bookable", async () => {
    const p = getPool();
    if (!p) return unknown("link.leaver_bookable", "Removed people are not still bookable", "company database not configured");
    const c = await p.connect();
    let gone: { name: string; email: string }[] = [];
    try {
      const r = await c.query(
        `SELECT name, LOWER(email) AS email FROM employees WHERE deleted_at IS NOT NULL AND email IS NOT NULL AND email <> ''`);
      gone = r.rows as any;
    } finally { c.release(); }
    if (!gone.length) return ok("link.leaver_bookable", "Removed people are not still bookable", "nobody has been removed");
    const active = new Set((await listMembers()).filter((m) => m.active).map((m) => (m.email || "").toLowerCase()));
    const still = gone.filter((g) => active.has(g.email)).map((g) => g.name);
    return still.length
      ? bad("link.leaver_bookable", "Removed people are not still bookable",
            `${still.join(", ")} — removed from the team but still taking bookings`)
      : ok("link.leaver_bookable", "Removed people are not still bookable", `${gone.length} leaver(s), none still bookable`);
  }));

  // ── settings that quietly switch a whole feature off ──────────────────────────────────────
  out.push(await attempt("cfg.email", "Alerts and invites can be emailed", async () =>
    process.env.RESEND_API_KEY
      ? ok("cfg.email", "Alerts and invites can be emailed", "Resend configured")
      : bad("cfg.email", "Alerts and invites can be emailed",
            "RESEND_API_KEY is missing — no invites, no reminders, and no alert emails including this one")));

  out.push(await attempt("cfg.cron", "Scheduled jobs can authenticate", async () =>
    process.env.CRON_SECRET
      ? ok("cfg.cron", "Scheduled jobs can authenticate", "CRON_SECRET set")
      : bad("cfg.cron", "Scheduled jobs can authenticate",
            "CRON_SECRET is missing — every scheduled run is being rejected, so nothing is running")));

  return out;
}

/**
 * LivoDraft checks itself and hands the results over; the portal is the single place alerts and
 * the banner live, so the owner has one dashboard rather than two.
 */
export async function runLivodraftChecks(): Promise<CheckResult[]> {
  const base = (process.env.LIVODRAFT_API_URL || "").replace(/\/+$/, "");
  const key = process.env.PARTNER_API_KEY || "";
  const id = "livodraft.reachable", title = "LivoDraft is reachable";
  if (!base || !key) {
    return [unknown(id, title, "LIVODRAFT_API_URL or PARTNER_API_KEY is not set — LivoDraft is not being watched at all")];
  }
  try {
    const r = await fetch(`${base}/api/partner/health`, {
      headers: { "X-Partner-Key": key }, cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) {
      return [{ id, app: "LivoDraft", title, ok: false, severity: "critical",
                detail: `LivoDraft answered ${r.status} — the site itself may be down` }];
    }
    const j = await r.json().catch(() => ({} as any));
    const checks: CheckResult[] = Array.isArray(j?.checks) ? j.checks : [];
    if (!checks.length) {
      return [{ id, app: "LivoDraft", title, ok: false, severity: "critical",
                detail: "LivoDraft answered but reported no checks" }];
    }
    return [{ id, app: "LivoDraft", title, ok: true, severity: "critical", detail: `${checks.length} checks reported` }, ...checks];
  } catch (e: any) {
    return [{ id, app: "LivoDraft", title, ok: false, severity: "critical",
              detail: `could not reach LivoDraft: ${e?.message || e}`.slice(0, 250) }];
  }
}
