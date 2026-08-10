// Signed, shareable token so a team member can connect their own Google without an
// admin session. HMAC over the member id — tamper-proof, no expiry (revoke = remove member).
import crypto from "crypto";

const SECRET = () => process.env.MEET_LINK_SECRET || process.env.PORTAL_SESSION_SECRET || "dev-meet-secret-change-me";

export function signMemberToken(memberId: string): string {
  const body = Buffer.from(memberId).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyMemberToken(token: string | null): string | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", SECRET()).update(body).digest("base64url");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    return Buffer.from(body, "base64url").toString();
  } catch {
    return null;
  }
}
