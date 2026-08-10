/**
 * Availability / slot engine for the Avloryn Meetings booking system.
 *
 * Pure + deterministic (no I/O) so it can be tested exhaustively. All instants are
 * handled as UTC epoch-millis internally; working hours are given in each member's
 * IANA timezone and converted with luxon (the only correct way to handle DST etc.).
 *
 * Two modes:
 *   - "all": a slot is offered only if EVERY selected member is free (group / panel).
 *   - "any": a slot is offered if ANY selected member is free (round-robin); the slot
 *            carries the list of free members and the caller picks one at booking time.
 */
import { DateTime } from "luxon";

/** weekday: 0=Sun, 1=Mon … 6=Sat (matches JS Date.getDay()). time: "HH:MM" 24h, in member TZ. */
export type WorkingHours = { weekday: number; start: string; end: string };
/** A busy interval, ISO 8601 (any offset; parsed as an instant). */
export type Interval = { start: string; end: string };

export type MemberAvailability = {
  memberId: string;
  timezone: string; // IANA, e.g. "Asia/Kolkata"
  workingHours: WorkingHours[];
  busy: Interval[]; // from Google free/busy
};

export type SlotQuery = {
  members: MemberAvailability[];
  mode: "all" | "any";
  durationMin: number;
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
  slotGranularityMin?: number; // grid step (default = durationMin)
  minNoticeMin?: number; // can't book sooner than this from `now`
  fromISO: string; // window start (instant)
  toISO: string; // window end (instant)
  nowISO?: string; // reference "now" (defaults to Date.now()); injectable for tests
};

export type Slot = { startISO: string; endISO: string; memberIds: string[] };

const MIN = 60_000;
const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE;
const iso = (ms: number) => new Date(ms).toISOString();

/** luxon weekday (1=Mon..7=Sun) → JS weekday (0=Sun..6=Sat). */
const luxonToJsWeekday = (w: number) => w % 7;

function parseHM(s: string): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s || "").trim());
  if (!m) return [NaN, NaN];
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

/** Concrete working intervals (UTC ms) for a member across [fromMs, toMs], expanding
 *  their per-weekday working hours in their own timezone (DST-correct via luxon). */
function workingIntervalsUTC(m: MemberAvailability, fromMs: number, toMs: number): [number, number][] {
  const out: [number, number][] = [];
  if (!DateTime.local().setZone(m.timezone).isValid) {
    // invalid timezone → treat as no availability rather than throwing
    return out;
  }
  let day = DateTime.fromMillis(fromMs, { zone: "utc" }).setZone(m.timezone).startOf("day");
  const end = DateTime.fromMillis(toMs, { zone: "utc" }).setZone(m.timezone).endOf("day");
  // guard against pathological ranges
  let guard = 0;
  while (day <= end && guard++ < 400) {
    const jsWd = luxonToJsWeekday(day.weekday);
    for (const wh of m.workingHours) {
      if (wh.weekday !== jsWd) continue;
      const [sh, sm] = parseHM(wh.start);
      const [eh, em] = parseHM(wh.end);
      if (Number.isNaN(sh) || Number.isNaN(eh)) continue;
      const s = day.set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
      const e = day.set({ hour: eh, minute: em, second: 0, millisecond: 0 });
      if (e.isValid && s.isValid && e.toMillis() > s.toMillis()) out.push([s.toMillis(), e.toMillis()]);
    }
    day = day.plus({ days: 1 });
  }
  return out;
}

function parseBusy(m: MemberAvailability): [number, number][] {
  const out: [number, number][] = [];
  for (const b of m.busy || []) {
    const s = Date.parse(b.start), e = Date.parse(b.end);
    if (!Number.isNaN(s) && !Number.isNaN(e) && e > s) out.push([s, e]);
  }
  return out;
}

/** Candidate start instants: stepped by `gran` from each member's working-interval START
 *  (so slots land on clean member-local times, e.g. 9:00/9:30, not UTC-aligned :00), then
 *  de-duplicated + sorted. Only starts within [fromMs, toMs] whose slot fits the window. */
function candidateStarts(
  prepared: { working: [number, number][] }[],
  fromMs: number, toMs: number, granMs: number, durMs: number,
): number[] {
  const set = new Set<number>();
  let guard = 0;
  for (const m of prepared) {
    for (const [ws, we] of m.working) {
      for (let t = ws; t + durMs <= we && guard < 200_000; t += granMs, guard++) {
        if (t >= fromMs && t + durMs <= toMs) set.add(t);
      }
    }
  }
  return [...set].sort((a, b) => a - b);
}

export function computeSlots(q: SlotQuery): Slot[] {
  const durMs = Math.max(1, Math.round(q.durationMin)) * MIN;
  const granMs = Math.max(1, Math.round(q.slotGranularityMin || q.durationMin)) * MIN;
  const bufB = Math.max(0, q.bufferBeforeMin || 0) * MIN;
  const bufA = Math.max(0, q.bufferAfterMin || 0) * MIN;
  const nowMs = q.nowISO ? Date.parse(q.nowISO) : Date.now();
  const minNotice = Math.max(0, q.minNoticeMin || 0) * MIN;
  const fromMs = Math.max(Date.parse(q.fromISO), nowMs + minNotice);
  const toMs = Date.parse(q.toISO);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs) || toMs <= fromMs || !q.members?.length) return [];

  // Pre-compute each member's working intervals + busy, and the shared candidate grid.
  const prepared = q.members.map((m) => ({
    id: m.memberId,
    working: workingIntervalsUTC(m, fromMs, toMs),
    busy: parseBusy(m),
  }));
  const grid = candidateStarts(prepared, fromMs, toMs, granMs, durMs);

  const freeAt = (mem: { working: [number, number][]; busy: [number, number][] }, t: number): boolean => {
    // the slot must fit fully inside one working interval …
    if (!mem.working.some(([ws, we]) => t >= ws && t + durMs <= we)) return false;
    // … and the buffered slot must not collide with any busy interval.
    const ps = t - bufB, pe = t + durMs + bufA;
    return !mem.busy.some(([bs, be]) => overlaps(ps, pe, bs, be));
  };

  const slots: Slot[] = [];
  for (const t of grid) {
    const freeMembers = prepared.filter((m) => freeAt(m, t)).map((m) => m.id);
    if (q.mode === "all") {
      if (freeMembers.length === prepared.length) slots.push({ startISO: iso(t), endISO: iso(t + durMs), memberIds: prepared.map((m) => m.id) });
    } else {
      if (freeMembers.length > 0) slots.push({ startISO: iso(t), endISO: iso(t + durMs), memberIds: freeMembers });
    }
  }
  return slots;
}
