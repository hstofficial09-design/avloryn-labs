import { NextResponse } from "next/server";
import { getSession } from "@/lib/portal-auth";
import { softDeleteEmployee } from "@/lib/portal-db";
import { setMemberActiveByEmail, upcomingForMemberEmail } from "@/lib/booking/db";

export const runtime = "nodejs";

/**
 * Owner-only. One delete that reaches everywhere the person still exists.
 *
 * The record and their commissions are kept and hard-purged a year later; what stops immediately
 * is their ability to act — their code, their place in every list, and their availability in
 * scheduling. Scheduling is a separate database, so it has to be told separately; before this it
 * never was, and a leaver stayed bookable until someone remembered to remove them by hand.
 *
 * Upcoming meetings are reported rather than cancelled: a meeting with a client is not ours to
 * call off silently, and the owner needs to know to reassign it.
 */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const d = await req.json().catch(() => ({}));
  if (!d.employee_id) return NextResponse.json({ error: "employee_id required" }, { status: 400 });

  const gone = await softDeleteEmployee(String(d.employee_id));

  // Scheduling: best-effort. A failure here must not leave the person half-deleted in the portal,
  // so it is reported instead of thrown — the owner is told exactly what did not happen.
  let scheduling = 0;
  let upcoming: { id: string; start_utc: string; client_name: string }[] = [];
  let schedulingError = "";
  if (gone.email) {
    try {
      upcoming = await upcomingForMemberEmail(gone.email);
      scheduling = await setMemberActiveByEmail(gone.email, false);
    } catch (e: any) {
      schedulingError = e?.message || "Could not reach scheduling";
      console.error("[delete-employee] scheduling not updated:", e);
    }
  }

  return NextResponse.json({
    success: true,
    name: gone.name,
    codesDisabled: gone.codes,
    schedulingRemoved: scheduling,
    upcomingMeetings: upcoming.length,
    ...(schedulingError ? { schedulingError } : {}),
  });
}
