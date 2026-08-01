import { NextResponse } from "next/server";
import { getSession, hashPassword, verifyPassword } from "@/lib/portal-auth";
import { getEmployeeByEmail, setEmployeePassword } from "@/lib/portal-db";

export const runtime = "nodejs";

// Employee changes their OWN password (must know the current one).
export async function POST(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "employee") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const d = await req.json().catch(() => ({}));
  const current = String(d.current || "");
  const next = String(d.new || "");
  if (next.length < 4) return NextResponse.json({ error: "New password must be at least 4 characters" }, { status: 400 });

  const emp = await getEmployeeByEmail(s.email);
  if (!emp || !verifyPassword(current, emp.password_hash)) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }
  await setEmployeePassword(emp.id, hashPassword(next));
  return NextResponse.json({ success: true });
}
