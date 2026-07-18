import { NextResponse } from "next/server";
import { getSession } from "@/lib/portal-auth";
import { markCommissionsPaid } from "@/lib/portal-db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const d = await req.json().catch(() => ({}));
  if (!d.employee_id) return NextResponse.json({ error: "employee_id required" }, { status: 400 });
  try {
    const paid = await markCommissionsPaid(String(d.employee_id));
    return NextResponse.json({ success: true, paid_inr: paid });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
