import { NextResponse } from "next/server";
import { getEmployeeByEmail } from "@/lib/portal-db";
import { verifyPassword, signSession, isOwnerLogin, SESSION_COOKIE } from "@/lib/portal-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { email, password, remember } = await req.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }
  const rememberMe = !!remember;

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

  // Remembered → 30-day persistent cookie. Not remembered → a browser-session cookie
  // (cleared when the browser closes) with a short 12h ceiling; the client SessionGuard
  // signs out after 30 min idle / on a Back-cache restore.
  const prod = process.env.NODE_ENV === "production";
  const ttlSec = rememberMe ? 30 * 24 * 3600 : 12 * 3600;
  const token = signSession({ ...session, exp: Date.now() + ttlSec * 1000 });
  const res = NextResponse.json({ success: true, role: session.role });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: prod,
    path: "/",
    ...(rememberMe ? { maxAge: ttlSec } : {}), // omit maxAge ⇒ session cookie
  });
  // Readable flag so the client-side idle/back guard knows whether to auto sign-out.
  res.cookies.set("portal_remember", rememberMe ? "1" : "0", {
    httpOnly: false,
    sameSite: "lax",
    secure: prod,
    path: "/",
    ...(rememberMe ? { maxAge: ttlSec } : {}),
  });
  return res;
}
