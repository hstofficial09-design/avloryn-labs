import { NextResponse } from "next/server";
import { getSession } from "@/lib/portal-auth";
import { restoreEmployee } from "@/lib/portal-db";

export const runtime = "nodejs";

// Owner-only. Brings a soft-deleted employee back into the active list.
export async function POST(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const d = await req.json().catch(() => ({}));
  if (!d.employee_id) return NextResponse.json({ error: "employee_id required" }, { status: 400 });
  await restoreEmployee(String(d.employee_id));
  return NextResponse.json({ success: true });
}
