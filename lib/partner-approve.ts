import crypto from "crypto";
import { Resend } from "resend";
import { hashPassword } from "@/lib/portal-auth";
import { getPendingPartner, approvePartnerWithLogin } from "@/lib/portal-db";
import { SITE_URL } from "@/lib/seo";

/**
 * Turn a pending partner into a live one: mint a login password, activate their referral code,
 * and email them the credentials.
 *
 * Shared by the two ways a partner goes live — the owner approving one a BD added, and the owner
 * adding one directly under themselves — so both send the same email and neither can drift.
 * Whoever adds the partner never sees the password; only the partner receives it.
 */
export async function approvePartnerAndEmail(
  id: string,
): Promise<{ ok: boolean; emailed: boolean; error?: string; status?: number }> {
  const partner = await getPendingPartner(id);
  if (!partner) return { ok: false, emailed: false, error: "Not found or already approved", status: 404 };
  if (!partner.email || !partner.email.includes("@")) {
    return { ok: false, emailed: false, error: "This partner has no email on file — cannot send login.", status: 400 };
  }

  // An existing employee already has a login — approving them must NOT reset it. Only a brand-new
  // person gets a generated password.
  const pw = partner.has_password
    ? null
    : crypto.randomBytes(6).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) + "9a";
  try {
    await approvePartnerWithLogin(id, pw ? hashPassword(pw) : null);
  } catch (e: any) {
    return { ok: false, emailed: false, error: e?.message || "Could not approve", status: 500 };
  }

  // Best-effort — approval still stands if the email fails, and the caller is told it didn't send.
  let emailed = false;
  const key = process.env.RESEND_API_KEY;
  if (key) {
    const from = process.env.CONTACT_FROM_EMAIL || "Avloryn Labs <onboarding@resend.dev>";
    const body = pw
      ? `Hi ${partner.name || "there"},

Welcome to the Avloryn network partner program — you're approved!

Sign in to your partner portal to see your referral code, earnings and the users under you:

  Portal:   ${SITE_URL}/portal/login
  Email:    ${partner.email}
  Password: ${pw}

Please change this password after your first login (Password on the dashboard).

— Avloryn Labs`
      : `Hi ${partner.name || "there"},

You're approved as an Avloryn network partner! Your referral code is now live.

Sign in with your EXISTING portal login to see your code, earnings and the users under you:

  Portal: ${SITE_URL}/portal/login
  Email:  ${partner.email}

(If you've forgotten your password, use "Forgot password" on the login page.)

— Avloryn Labs`;
    try {
      await new Resend(key).emails.send({
        from,
        to: partner.email,
        subject: "You're approved — Avloryn Partner Portal",
        text: body,
      });
      emailed = true;
    } catch {
      /* best-effort */
    }
  }

  return { ok: true, emailed };
}
