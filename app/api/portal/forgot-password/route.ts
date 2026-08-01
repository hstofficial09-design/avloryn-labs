import { NextResponse } from "next/server";
import crypto from "crypto";
import { Resend } from "resend";
import { setResetToken } from "@/lib/portal-db";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";

// Public: emails a one-hour reset link. Always returns a generic success so it
// never reveals whether an email is registered (no account enumeration).
export async function POST(req: Request) {
  const d = await req.json().catch(() => ({}));
  const email = String(d.email || "").trim();
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  const token = crypto.randomBytes(24).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  let emp: { id: string; name: string; email: string } | null = null;
  try {
    emp = await setResetToken(email, tokenHash, expires);
  } catch {
    emp = null;
  }

  if (emp) {
    const key = process.env.RESEND_API_KEY;
    if (key) {
      const from = process.env.CONTACT_FROM_EMAIL || "Avloryn Labs <onboarding@resend.dev>";
      const link = `${SITE_URL}/portal/reset?token=${token}`;
      try {
        await new Resend(key).emails.send({
          from,
          to: emp.email,
          subject: "Reset your Avloryn Partner Portal password",
          text: `Hi ${emp.name || "there"},\n\nUse this link to set a new password (valid for 1 hour):\n${link}\n\nIf you didn't request this, you can safely ignore this email.\n\n— Avloryn Labs`,
        });
      } catch {
        /* email best-effort */
      }
    }
  }
  return NextResponse.json({ ok: true });
}
