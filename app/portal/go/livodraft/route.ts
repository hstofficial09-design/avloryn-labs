import { NextResponse } from "next/server";
import { getSession } from "@/lib/portal-auth";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner-only SSO handoff into the LivoDraft admin. Mints a short-lived HMAC token that
 *  LivoDraft's /admin/enter verifies, so livodraft.com/admin can stay hidden (404) to everyone
 *  else. The secret (ADMIN_SSO_SECRET, or PARTNER_API_KEY) must match LivoDraft's. */
export async function GET(req: Request) {
  // Behind Railway's proxy req.url resolves to the internal localhost:8080 bind, so a redirect
  // built from it sends the browser to localhost. Reconstruct the public origin from the
  // forwarded host headers instead.
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || new URL(req.url).host;
  const origin = `${proto}://${host}`;
  const s = await getSession();
  if (!s || s.role !== "owner") {
    return NextResponse.redirect(`${origin}/portal/login`);
  }
  const base = (process.env.LIVODRAFT_API_URL || "https://livodraft.com").replace(/\/+$/, "");
  const secret = process.env.ADMIN_SSO_SECRET || process.env.PARTNER_API_KEY || "";
  if (!secret) {
    return NextResponse.json(
      { error: "Admin SSO not configured — set ADMIN_SSO_SECRET (or PARTNER_API_KEY) on the portal." },
      { status: 503 });
  }
  const exp = Math.floor(Date.now() / 1000) + 60; // 60-second one-time-ish window
  const sig = crypto.createHmac("sha256", secret).update(String(exp)).digest("hex");
  return NextResponse.redirect(`${base}/admin/enter?t=${exp}.${sig}`);
}
