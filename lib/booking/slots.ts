/**
 * Bridges the DB + Google + the pure engine: load working hours, pull live free/busy,
 * and compute bookable slots for a meeting type. Server-only.
 */
import { DateTime } from "luxon";
import { computeSlots, type MemberAvailability, type Slot, type Interval } from "./availability";
import { getAvailability, getBlackoutDays, getMeetingTypeBySlug, listMembers, type MeetingType, type Member } from "./db";
import { memberBusy } from "./google";

export async function memberAvailabilityInputs(memberIds: string[], fromISO: string, toISO: string): Promise<MemberAvailability[]> {
  const all = await listMembers(true);
  const byId = new Map(all.map((m) => [m.id, m]));
  const out: MemberAvailability[] = [];
  await Promise.all(
    memberIds.map(async (id) => {
      const m = byId.get(id);
      if (!m) return;
      const [workingHours, busy, blackouts] = await Promise.all([getAvailability(id), memberBusy(id, fromISO, toISO), getBlackoutDays(id)]);
      // A blackout day = the member is fully busy that whole day in their own timezone.
      const blackoutBusy: Interval[] = [];
      for (const day of blackouts) {
        const start = DateTime.fromISO(day, { zone: m.timezone }).startOf("day");
        if (!start.isValid) continue;
        const end = start.plus({ days: 1 });
        blackoutBusy.push({ start: start.toUTC().toISO()!, end: end.toUTC().toISO()! });
      }
      out.push({ memberId: id, timezone: m.timezone, workingHours, busy: [...busy, ...blackoutBusy] });
    }),
  );
  return out;
}

/** All bookable slots for a meeting type over [fromISO,toISO]. `pickMemberIds` narrows
 *  the member pool (e.g. the client chose a specific person); default = the type's pool. */
export async function slotsForMeetingType(
  mt: MeetingType,
  fromISO: string,
  toISO: string,
  pickMemberIds?: string[],
  durationOverride?: number,
): Promise<Slot[]> {
  const ids = (pickMemberIds && pickMemberIds.length ? pickMemberIds : mt.member_ids).filter((id) => mt.member_ids.includes(id));
  if (!ids.length) return [];
  const members = await memberAvailabilityInputs(ids, fromISO, toISO);
  return computeSlots({
    members,
    mode: mt.mode,
    durationMin: durationOverride && durationOverride > 0 ? durationOverride : mt.duration_min,
    bufferBeforeMin: mt.buffer_before_min,
    bufferAfterMin: mt.buffer_after_min,
    slotGranularityMin: mt.slot_granularity_min,
    minNoticeMin: mt.min_notice_min,
    fromISO,
    toISO,
  });
}

export { getMeetingTypeBySlug };
export type { MeetingType, Member };
