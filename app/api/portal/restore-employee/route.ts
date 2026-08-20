import { NextResponse } from "next/server";
import { getSession } from "@/lib/portal-auth";
import { restoreEmployee } from "@/lib/portal-db";
import { setMemberActiveByEmail } from "@/lib/booking/db";

export const runtime = "nodejs";

/** Owner-only. Brings a soft-deleted person back everywhere the delete reached, scheduling
 *  included — otherwise a restore leaves them live in one place and switched off in another. */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const d = await req.json().catch(() => ({}));
  if (!d.employee_id) return NextResponse.json({ error: "employee_id required" }, { status: 400 });

  const back = await restoreEmployee(String(d.employee_id));
  let scheduling = 0, schedulingError = "";
  if (back.email) {
    try { scheduling = await setMemberActiveByEmail(back.email, true); }
    catch (e: any) { schedulingError = e?.message || "Could not reach scheduling"; }
  }
  return NextResponse.json({
    success: true, name: back.name, schedulingRestored: scheduling,
    ...(schedulingError ? { schedulingError } : {}),
  });
}
