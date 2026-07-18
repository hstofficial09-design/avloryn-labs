import { NextResponse } from "next/server";
import { getEmployeeByEmail } from "@/lib/portal-db";
import { verifyPassword, signSession, isOwnerLogin, SESSION_COOKIE } from "@/lib/portal-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  let session: { email: string; role: "owner" | "employee"; name?: string } | null = null;

  if (isOwnerLogin(email, password)) {
    session = { email: String(email).trim().toLowerCase(), role: "owner", name: "Owner" };
  } else {
    let emp: any = null;
    try {
      emp = await getEmployeeByEmail(email);
    } catch {
      return NextResponse.json({ error: "Portal is not configured yet" }, { status: 503 });
    }
    // Generic message + always run a verify to equalise timing (no user enumeration).
    const ok = !!emp && emp.active && verifyPassword(password, emp.password_hash);
    if (!emp) verifyPassword(password, "pbkdf2$200000$00$00");
    if (!ok) {
      return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
    }
    session = { email: String(emp.email || "").toLowerCase(), role: "employee", name: emp.name };
  }

  const token = signSession(session);
  const res = NextResponse.json({ success: true, role: session.role });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 3600,
  });
  return res;
}
