import { getSession } from "@/lib/portal-auth";
import { listMembers } from "./db";

/** Scheduling is open to the whole team: any logged-in portal user (owner OR employee). */
export async function canSchedule(): Promise<boolean> {
  const s = await getSession();
  return !!s;
}

/** True only for the owner (kept for anything that must stay owner-only). */
export async function isOwner(): Promise<boolean> {
  const s = await getSession();
  return !!s && s.role === "owner";
}

/**
 * Who this session may see in Scheduling.
 *
 * The whole team can use Scheduling, but a meeting is nobody else's business: an employee who
 * is not an attendee must not see it in the list or on the calendar, and must not be able to
 * join, reschedule or cancel it. The owner is not scoped.
 *
 * `memberId` is null when the signed-in person isn't on the scheduling team at all — they then
 * see no meetings rather than everyone's.
 */
export async function schedulingScope(): Promise<
  { ok: false } | { ok: true; owner: true } | { ok: true; owner: false; memberId: string | null }
> {
  const s = await getSession();
  if (!s) return { ok: false };
  if (s.role === "owner") return { ok: true, owner: true };
  const email = (s.email || "").trim().toLowerCase();
  const me = email ? (await listMembers()).find((m) => (m.email || "").trim().toLowerCase() === email) : undefined;
  return { ok: true, owner: false, memberId: me?.id ?? null };
}

/** True if this session is allowed to see/act on a meeting with these attendees. */
export function scopeAllows(
  scope: Awaited<ReturnType<typeof schedulingScope>>,
  memberIds: string[] | null | undefined,
): boolean {
  if (!scope.ok) return false;
  if (scope.owner) return true;
  return !!scope.memberId && (memberIds || []).includes(scope.memberId);
}
