/**
 * What the watchdog remembers between runs.
 *
 * A check on its own can only say "broken right now". That is not enough to act on: the thing you
 * actually need to know is "broken since Tuesday and nobody has touched it". So every check's
 * result is kept, with the moment it first went wrong, the moment it was last alerted, and whether
 * anyone has acknowledged it.
 *
 * Two tables, both additive and created on first use, in the same Postgres the portal already uses:
 *
 *   monitor_state  — one row per check: is it failing, since when, when did we last shout, has
 *                    anyone said they are on it.
 *   monitor_beats  — one row per scheduled job: the last time it proved it was alive. This is the
 *                    dead-man's switch. A job that dies stops writing here, and its silence is the
 *                    alert — which is the only way to catch a cron that is not running at all,
 *                    because a job that is not running cannot report its own failure.
 */
import { getPool } from "@/lib/portal-db";
import type { PoolClient } from "pg";

/** Re-alert on a still-broken check at these ages, each time with sharper wording. */
export const ESCALATION_HOURS = [24, 72, 168];
/** How long a job may stay silent before its silence is treated as failure. */
/**
 * How long a job may be silent before it counts as stopped.
 *
 * Both jobs are scheduled by the app itself (instrumentation.ts) — reminders every 15 minutes, the
 * watchdog hourly — so silence beyond a couple of cycles means something is genuinely wrong, not
 * that a scheduler is busy.
 *
 * These were briefly set to four and five hours, from measuring how late GitHub Actions fired.
 * That was fixing the wrong end: the answer was to stop depending on GitHub, not to widen the
 * window until its worst behaviour looked normal. A watchdog that tolerates thirteen hours of
 * silence is not watching anything.
 */
export const BEAT_GRACE_MIN: Record<string, number> = {
  "meet-reminders": 60,
  // The watchdog's own beat. If this stops, everything below stops being checked — the portal
  // banner reads this so a dead watchdog is visible instead of looking like "all clear".
  "monitor": 180,
};

export type CheckResult = {
  id: string; app: string; title: string;
  ok: boolean | null;          // null = could not be established; never treated as a pass
  severity: "critical" | "warn";
  detail: string;
};

export type StoredState = {
  id: string;
  first_failed_at: string | null;
  last_ok_at: string | null;
  last_alert_at: string | null;
  ack_at: string | null;
  ack_by: string | null;
  /** Deliberately set aside — a known, accepted state that should stop taking up attention. */
  muted_at: string | null;
  muted_by: string | null;
};

export type Tracked = CheckResult & StoredState & {
  /** Hours it has been failing, or null if it is fine. */
  brokenHours: number | null;
  /** Somebody has said they are dealing with it — stays visible, stops shouting. */
  acknowledged: boolean;
  /**
   * Set aside on purpose. Unlike acknowledging, this drops it out of the main list — for findings
   * that are true but accepted (someone who genuinely has no calendar and does not need one).
   * It is never deleted: it stays in a collapsed list with an undo, and comes BACK on its own the
   * moment the thing changes, because "I do not care about this today" must not mean "never tell
   * me about this again".
   */
  muted: boolean;
};

/**
 * Is this finding still the one that was set aside?
 *
 * Pure so it can be proven directly. The danger "Ignore" introduces is precise: ignore "Bhavya has
 * no calendar" and quietly never hear "Bhavya AND two others have no calendar". So the ignore is
 * pinned to the exact wording it was given for, and a recovery clears it — otherwise a decision
 * made once would silence the next genuine break of the same check forever.
 */
export function stillIgnored(
  mutedAt: string | Date | null | undefined,
  mutedDetail: string | null | undefined,
  detail: string,
  failing: boolean,
): boolean {
  if (!mutedAt) return false;
  if (!failing) return false;                 // it passed — the next break must be heard
  return (mutedDetail ?? null) === detail;    // the finding itself changed → back it comes
}

let ready = false;
async function ensure(c: PoolClient) {
  if (ready) return;
  await c.query(`CREATE TABLE IF NOT EXISTS monitor_state (
    id TEXT PRIMARY KEY,
    ok BOOLEAN,
    app TEXT, title TEXT, severity TEXT, detail TEXT,
    first_failed_at TIMESTAMPTZ,
    last_ok_at TIMESTAMPTZ,
    last_alert_at TIMESTAMPTZ,
    ack_at TIMESTAMPTZ, ack_by TEXT,
    updated_at TIMESTAMPTZ DEFAULT now())`);
  // Added after the table shipped, so it has to be a migration rather than part of CREATE.
  await c.query(`ALTER TABLE monitor_state ADD COLUMN IF NOT EXISTS muted_at TIMESTAMPTZ`);
  await c.query(`ALTER TABLE monitor_state ADD COLUMN IF NOT EXISTS muted_by TEXT`);
  await c.query(`ALTER TABLE monitor_state ADD COLUMN IF NOT EXISTS muted_detail TEXT`);
  await c.query(`CREATE TABLE IF NOT EXISTS monitor_beats (
    name TEXT PRIMARY KEY, at TIMESTAMPTZ NOT NULL, note TEXT)`);
  ready = true;
}

async function withClient<T>(fn: (c: PoolClient) => Promise<T>): Promise<T | null> {
  const p = getPool();
  if (!p) return null;
  const c = await p.connect();
  try {
    await ensure(c);
    return await fn(c);
  } finally {
    c.release();
  }
}

/** "I ran." Called by every scheduled job, at the END of a successful run. */
export async function beat(name: string, note = "") {
  await withClient(async (c) => {
    await c.query(
      `INSERT INTO monitor_beats (name, at, note) VALUES ($1, now(), $2)
       ON CONFLICT (name) DO UPDATE SET at = now(), note = EXCLUDED.note`,
      [name, note.slice(0, 300)],
    );
  }).catch((e) => console.error("[monitor] could not record beat", name, e));
}

export async function readBeats(): Promise<{ name: string; at: string; note: string | null }[]> {
  return (await withClient(async (c) => {
    const r = await c.query(`SELECT name, at, note FROM monitor_beats`);
    return r.rows.map((x) => ({ name: x.name, at: new Date(x.at).toISOString(), note: x.note }));
  })) || [];
}

/**
 * Turn "is this job silent?" into an ordinary check, so a dead cron is reported and escalated
 * exactly like any other failure rather than being a special case nobody looks at.
 */
export function beatChecks(beats: { name: string; at: string }[]): CheckResult[] {
  const byName = new Map(beats.map((b) => [b.name, b.at]));
  const label: Record<string, string> = {
    "meet-reminders": "Meeting reminders are running",
    "monitor": "The watchdog itself is running",
  };
  return Object.entries(BEAT_GRACE_MIN).map(([name, graceMin]) => {
    const at = byName.get(name);
    const title = label[name] || `${name} is running`;
    if (!at) {
      return { id: `beat.${name}`, app: "Avloryn", title, ok: null, severity: "critical" as const,
               detail: "has never reported in — either it has never run, or it cannot reach the database" };
    }
    const mins = Math.round((Date.now() - Date.parse(at)) / 60000);
    return {
      id: `beat.${name}`, app: "Avloryn", title, ok: mins <= graceMin, severity: "critical" as const,
      detail: mins <= graceMin
        ? `last ran ${mins} min ago`
        : `silent for ${mins > 1440 ? `${Math.round(mins / 1440)} day(s)` : `${mins} min`} — expected every ${graceMin} min at the latest`,
    };
  });
}

/** Merge this run's results with what we already knew, and work out what still needs shouting about. */
export async function reconcile(results: CheckResult[]): Promise<Tracked[]> {
  const merged = await withClient(async (c) => {
    const prev = new Map<string, StoredState>(
      (await c.query(`SELECT id, first_failed_at, last_ok_at, last_alert_at, ack_at, ack_by, muted_at, muted_by, muted_detail FROM monitor_state`))
        .rows.map((r) => [r.id, r as StoredState]),
    );
    const now = new Date();
    const out: Tracked[] = [];

    for (const r of results) {
      const p = prev.get(r.id);
      // Anything not a clear pass counts as failing. "Unknown" must never be silently optimistic —
      // a check that stopped being able to run is itself a fault worth knowing about.
      const failing = r.ok !== true;
      const firstFailed = failing ? (p?.first_failed_at ? new Date(p.first_failed_at) : now) : null;
      const lastOk = failing ? (p?.last_ok_at ? new Date(p.last_ok_at) : null) : now;
      // Recovering clears the acknowledgement, so the NEXT time it breaks it shouts again rather
      // than staying quiet because somebody ticked it off weeks ago.
      const ackAt = failing ? (p?.ack_at ? new Date(p.ack_at) : null) : null;
      const ackBy = failing ? p?.ack_by ?? null : null;
      // Ignoring is pinned to the finding you actually read. If the detail changes — a second
      // person's calendar breaks, a different name appears — that is news, so it un-ignores itself
      // rather than hiding a new fault behind an old decision. Recovering clears it too.
      const detail = r.detail.slice(0, 500);
      const stillSame = stillIgnored(p?.muted_at, (p as any)?.muted_detail, detail, failing);
      const mutedAt = stillSame ? new Date(p!.muted_at as string) : null;
      const mutedBy = mutedAt ? (p as any).muted_by ?? null : null;

      await c.query(
        `INSERT INTO monitor_state (id, ok, app, title, severity, detail, first_failed_at, last_ok_at, last_alert_at, ack_at, ack_by, muted_at, muted_by, muted_detail, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
         ON CONFLICT (id) DO UPDATE SET ok=$2, app=$3, title=$4, severity=$5, detail=$6,
           first_failed_at=$7, last_ok_at=$8, ack_at=$10, ack_by=$11,
           muted_at=$12, muted_by=$13, muted_detail=$14, updated_at=now()`,
        [r.id, r.ok, r.app, r.title, r.severity, detail,
         firstFailed, lastOk, p?.last_alert_at ?? null, ackAt, ackBy,
         mutedAt, mutedBy, mutedAt ? detail : null],
      );

      out.push({
        ...r,
        first_failed_at: firstFailed ? firstFailed.toISOString() : null,
        last_ok_at: lastOk ? lastOk.toISOString() : null,
        last_alert_at: p?.last_alert_at ? new Date(p.last_alert_at).toISOString() : null,
        ack_at: ackAt ? ackAt.toISOString() : null,
        ack_by: ackBy,
        brokenHours: firstFailed ? (now.getTime() - firstFailed.getTime()) / 3_600_000 : null,
        acknowledged: !!ackAt,
        muted_at: mutedAt ? mutedAt.toISOString() : null,
        muted_by: mutedBy,
        muted: !!mutedAt,
      });
    }
    return out;
  });
  // No database means no memory — still report this run's results so the alert can go out.
  return merged || results.map((r) => ({
    ...r, first_failed_at: null, last_ok_at: null, last_alert_at: null, ack_at: null, ack_by: null,
    muted_at: null, muted_by: null, brokenHours: null, acknowledged: false, muted: false,
  }));
}

/**
 * Should this failure be emailed right now?
 *
 * The whole point is to be heard. Emailing every failure every fifteen minutes trains you to
 * ignore the emails, and then the one that matters is ignored too. So: shout once when it breaks,
 * then again at a day, three days, a week — each one louder, because "still broken and nobody has
 * touched it" is a different and worse message than "something just broke". Acknowledging it stops
 * the shouting without hiding it from the dashboard.
 */
export function shouldAlert(t: Tracked): { alert: boolean; stage: number } {
  if (t.ok === true) return { alert: false, stage: -1 };
  // Set aside on purpose. It stays on the dashboard in the ignored list, but it has been read and
  // decided on, so it does not get to interrupt anyone again until the finding itself changes.
  if (t.muted) return { alert: false, stage: -1 };
  if (t.acknowledged) return { alert: false, stage: -1 };
  if (!t.last_alert_at) return { alert: true, stage: 0 };              // first time we have seen it
  const hoursBroken = t.brokenHours ?? 0;
  const hoursSinceAlert = (Date.now() - Date.parse(t.last_alert_at)) / 3_600_000;
  for (let i = ESCALATION_HOURS.length - 1; i >= 0; i--) {
    const due = ESCALATION_HOURS[i];
    // Reached the next milestone and we have not already shouted since then.
    if (hoursBroken >= due && hoursSinceAlert >= due - (ESCALATION_HOURS[i - 1] ?? 0)) {
      return { alert: true, stage: i + 1 };
    }
  }
  return { alert: false, stage: -1 };
}

export async function markAlerted(ids: string[]) {
  if (!ids.length) return;
  await withClient(async (c) => {
    await c.query(`UPDATE monitor_state SET last_alert_at = now() WHERE id = ANY($1)`, [ids]);
  }).catch((e) => console.error("[monitor] could not mark alerted", e));
}

/** "I have seen it, I am on it" — stops the re-alerts, keeps it on the dashboard until it recovers. */
export async function acknowledge(id: string, who: string) {
  await withClient(async (c) => {
    await c.query(`UPDATE monitor_state SET ack_at = now(), ack_by = $2 WHERE id = $1`, [id, who]);
  });
}

export async function unacknowledge(id: string) {
  await withClient(async (c) => {
    await c.query(`UPDATE monitor_state SET ack_at = NULL, ack_by = NULL WHERE id = $1`, [id]);
  });
}

/**
 * "I know, and I am fine with it" — the finding is true but accepted, so stop it taking up room.
 *
 * Not a delete and not a permanent off switch. The exact wording being ignored is stored alongside,
 * so if the finding changes at all it comes straight back: ignoring "Bhavya has no calendar" must
 * never also hide "Bhavya AND two others have no calendar". It also returns on its own once the
 * check passes again, so the next genuine break is heard.
 */
export async function mute(id: string, who: string) {
  await withClient(async (c) => {
    await c.query(
      `UPDATE monitor_state SET muted_at = now(), muted_by = $2, muted_detail = detail WHERE id = $1`,
      [id, who]);
  });
}

export async function unmute(id: string) {
  await withClient(async (c) => {
    await c.query(`UPDATE monitor_state SET muted_at = NULL, muted_by = NULL, muted_detail = NULL WHERE id = $1`, [id]);
  });
}

/** What the portal banner reads — the last known state, without re-running anything. */
export async function readState(): Promise<Tracked[]> {
  return (await withClient(async (c) => {
    const r = await c.query(
      `SELECT id, ok, app, title, severity, detail, first_failed_at, last_ok_at, last_alert_at, ack_at, ack_by, muted_at, muted_by, muted_detail
         FROM monitor_state ORDER BY (ok IS NOT TRUE) DESC, severity, app, title`);
    const now = Date.now();
    return r.rows.map((x): Tracked => ({
      id: x.id, app: x.app || "Avloryn", title: x.title || x.id, severity: x.severity || "critical",
      detail: x.detail || "", ok: x.ok,
      first_failed_at: x.first_failed_at ? new Date(x.first_failed_at).toISOString() : null,
      last_ok_at: x.last_ok_at ? new Date(x.last_ok_at).toISOString() : null,
      last_alert_at: x.last_alert_at ? new Date(x.last_alert_at).toISOString() : null,
      ack_at: x.ack_at ? new Date(x.ack_at).toISOString() : null,
      ack_by: x.ack_by,
      // Same rule as reconcile: an ignore is pinned to the wording it was given for.
      muted_at: stillIgnored(x.muted_at, x.muted_detail, x.detail || "", x.ok !== true) ? new Date(x.muted_at).toISOString() : null,
      muted_by: stillIgnored(x.muted_at, x.muted_detail, x.detail || "", x.ok !== true) ? x.muted_by : null,
      brokenHours: x.first_failed_at ? (now - new Date(x.first_failed_at).getTime()) / 3_600_000 : null,
      acknowledged: !!x.ack_at,
      muted: stillIgnored(x.muted_at, x.muted_detail, x.detail || "", x.ok !== true),
    }));
  })) || [];
}
