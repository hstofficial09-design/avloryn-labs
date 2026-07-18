import { NextResponse } from "next/server";
import { getSession, hashPassword } from "@/lib/portal-auth";
import { setEmployeePassword } from "@/lib/portal-db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const d = await req.json().catch(() => ({}));
  if (!d.employee_id || !d.password || String(d.password).length < 4) {
    return NextResponse.json({ error: "employee_id and a password (min 4 chars) are required" }, { status: 400 });
  }
  try {
    await setEmployeePassword(String(d.employee_id), hashPassword(String(d.password)));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
