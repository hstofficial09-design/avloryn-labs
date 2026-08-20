/**
 * Is anyone already busy then?
 *
 * The public booking route has always re-read everyone's live calendars before confirming a slot.
 * The two owner-side paths — creating a meeting by hand, and rescheduling one — did not, so either
 * could drop a meeting straight on top of something already in the diary. That is how a meeting
 * ended up double-booked over one that was already there.
 *
 * Reads the real calendars rather than our own bookings table, because a meeting the team put in
 * Google or Zoho directly is just as much a clash as one we created.
 */
import { listMembers, membersWithGoogle, membersWithZoho } from "./db";
import { memberEvents } from "./google";
import { getZohoBusy } from "./zoho";

export type Clash = { memberId: string; name: string; title?: string; startISO: string; endISO: string };

/** Two intervals overlap when each starts before the other ends. */
const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE;

export async function findClashes(opts: {
  memberIds: string[];
  startISO: string;
  endISO: string;
  /**
   * The meeting being moved. Its own copies sit on those calendars at the old time and would
   * otherwise report as a clash with itself — most obviously when nudging a meeting by ten
   * minutes, where the old and new windows overlap.
   */
  ignoreStartISO?: string | null;
}): Promise<Clash[]> {
  const s = Date.parse(opts.startISO), e = Date.parse(opts.endISO);
  if (!opts.memberIds.length || Number.isNaN(s) || Number.isNaN(e) || e <= s) return [];

  const members = await listMembers();
  const byId = new Map(members.map((m) => [m.id, m]));
  const [g, z] = await Promise.all([membersWithGoogle(opts.memberIds), membersWithZoho(opts.memberIds)]);
  const ignore = opts.ignoreStartISO ? Date.parse(opts.ignoreStartISO) : NaN;

  // Widen the read a little either side so an event starting just before the slot is seen.
  const from = new Date(s - 2 * 3600_000).toISOString();
  const to = new Date(e + 2 * 3600_000).toISOString();

  const out: Clash[] = [];
  await Promise.all(opts.memberIds.map(async (id) => {
    const [gEv, zEv] = await Promise.all([
      g.has(id) ? memberEvents(id, from, to).catch(() => []) : Promise.resolve([]),
      z.has(id) ? getZohoBusy(id, from, to).catch(() => []) : Promise.resolve([]),
    ]);
    for (const b of [...gEv, ...zEv]) {
      const bs = Date.parse(b.start), be = Date.parse(b.end);
      if (Number.isNaN(bs) || Number.isNaN(be)) continue;
      // The meeting's own copy, still sitting at the time we are moving it away from.
      if (!Number.isNaN(ignore) && Math.abs(bs - ignore) < 60_000) continue;
      if ((b as any).allDay) continue;   // an all-day marker is not a meeting you can't attend
      if (!overlaps(s, e, bs, be)) continue;
      out.push({
        memberId: id, name: byId.get(id)?.name || "Someone",
        title: b.title, startISO: new Date(bs).toISOString(), endISO: new Date(be).toISOString(),
      });
      break;   // one clash per person is enough to say no
    }
  }));
  return out;
}

/** A sentence the owner can act on: who is busy, with what, and when. */
export function clashMessage(clashes: Clash[]): string {
  const when = (iso: string) => new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true,
  });
  return clashes
    .map((c) => `${c.name} is busy ${when(c.startISO)}–${when(c.endISO)}${c.title ? ` (${c.title})` : ""}`)
    .join("; ");
}
