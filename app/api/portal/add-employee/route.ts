import { NextResponse } from "next/server";
import { getSession, hashPassword } from "@/lib/portal-auth";
import { addEmployee } from "@/lib/portal-db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const d = await req.json().catch(() => ({}));
  if (!d.name || !d.email || !d.password) {
    return NextResponse.json({ error: "Name, email and a temp password are required" }, { status: 400 });
  }
  try {
    const r = await addEmployee({
      name: d.name, email: d.email, mobile: d.mobile, emp_type: d.emp_type || "intern",
      track: d.track || "", commission_pct: Number(d.commission_pct || 10),
      password_hash: hashPassword(String(d.password)), source: "manual",
    });
    return NextResponse.json({ success: true, id: r.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to add employee" }, { status: 500 });
  }
}
