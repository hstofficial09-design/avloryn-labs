import { NextResponse } from "next/server";
import { getSession } from "@/lib/portal-auth";
import { softDeleteEmployee } from "@/lib/portal-db";

export const runtime = "nodejs";

// Owner-only. Soft delete: the record + its commissions are kept and hard-purged
// automatically 1 year after deletion.
export async function POST(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const d = await req.json().catch(() => ({}));
  if (!d.employee_id) return NextResponse.json({ error: "employee_id required" }, { status: 400 });
  await softDeleteEmployee(String(d.employee_id));
  return NextResponse.json({ success: true });
}
