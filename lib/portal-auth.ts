/**
 * Partner Portal auth — password hashing (pbkdf2) + HMAC-signed session cookie.
 * Built-in node:crypto only. Server-only. Owner logs in with env creds; employees
 * with the email + password the owner set. Set PORTAL_SESSION_SECRET (long random),
 * PORTAL_OWNER_EMAIL, PORTAL_OWNER_PASSWORD in env.
 */
import crypto from "crypto";
import { cookies } from "next/headers";

const SECRET = process.env.PORTAL_SESSION_SECRET || "dev-portal-secret-change-me-in-prod";
export const SESSION_COOKIE = "portal_session";
export type Role = "owner" | "employee";
export type Session = { email: string; role: Role; name?: string; exp: number };

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(pw, salt, 200000, 32, "sha256").toString("hex");
  return `pbkdf2$200000$${salt}$${hash}`;
}

export function verifyPassword(pw: string, stored?: string | null): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 4) return false;
  const [, iterStr, salt, hash] = parts;
  const test = crypto.pbkdf2Sync(pw, salt, parseInt(iterStr, 10) || 200000, 32, "sha256").toString("hex");
  if (test.length !== hash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(test), Buffer.from(hash));
}

function hmac(s: string) {
  return crypto.createHmac("sha256", SECRET).update(s).digest("base64url");
}

export function signSession(sess: Omit<Session, "exp"> & { exp?: number }): string {
  const payload: Session = { ...sess, exp: sess.exp ?? Date.now() + 7 * 24 * 3600 * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(body)}`;
}

export function verifySession(token?: string | null): Session | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = hmac(body);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString()) as Session;
    if (!s.exp || s.exp < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

/** Owner login check against env creds.
 *  Owner password = PORTAL_OWNER_PASSWORD, else falls back to ADMIN_PASSWORD — so you can
 *  set the SAME password as the LivoDraft admin (just put ADMIN_PASSWORD on Avloryn too). */
export function isOwnerLogin(email: string, password: string): boolean {
  const oe = (process.env.PORTAL_OWNER_EMAIL || "").trim().toLowerCase();
  const op = process.env.PORTAL_OWNER_PASSWORD || process.env.ADMIN_PASSWORD || "";
  if (!oe || !op) return false;
  return email.trim().toLowerCase() === oe && password === op;
}
