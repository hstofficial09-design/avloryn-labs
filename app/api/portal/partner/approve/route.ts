import { NextResponse } from "next/server";
import crypto from "crypto";
import { Resend } from "resend";
import { getSession, hashPassword } from "@/lib/portal-auth";
import { getPendingPartner, approvePartnerWithLogin } from "@/lib/portal-db";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** OWNER-ONLY. Approve a BD-added network partner: generate a login password, activate their
 *  referral code, and EMAIL the credentials straight to the partner. The BD never sees the
 *  password (it isn't returned) — only the partner receives it. */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "owner") return NextResponse.json({ error: "Owner only" }, { status: 403 });
  const d = await req.json().catch(() => ({} as any));
  const id = (d?.employee_id || "").trim();
  if (!id) return NextResponse.json({ error: "employee_id required" }, { status: 400 });

  const partner = await getPendingPartner(id);
  if (!partner) return NextResponse.json({ error: "Not found or already approved" }, { status: 404 });
  if (!partner.email || !partner.email.includes("@")) {
    return NextResponse.json({ error: "This partner has no email on file — cannot send login." }, { status: 400 });
  }

  // An existing employee already has a login — approving them must NOT reset it. Only a brand-new
  // person gets a generated password.
  const pw = partner.has_password ? null : crypto.randomBytes(6).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) + "9a";
  try {
    await approvePartnerWithLogin(id, pw ? hashPassword(pw) : null);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not approve" }, { status: 500 });
  }

  // Email the partner (best-effort — approval still succeeds if email fails). New person gets
  // their credentials; an existing employee is told to use their existing login.
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
        from, to: partner.email,
        subject: "You're approved — Avloryn Partner Portal",
        text: body,
      });
      emailed = true;
    } catch { /* best-effort */ }
  }

  return NextResponse.json({ ok: true, emailed });
}
