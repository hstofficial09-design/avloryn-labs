import { getSession } from "@/lib/portal-auth";

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
