import { NextResponse } from "next/server";
import { verifyMemberToken } from "@/lib/booking/link";
import { authUrl, googleConfigured } from "@/lib/booking/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A team member opens this signed link (shared by the organizer) to connect their
// own Google account. Redirects straight to Google's consent screen.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const memberId = verifyMemberToken(url.searchParams.get("t"));
  if (!memberId) return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
  if (!googleConfigured()) return NextResponse.json({ error: "Google is not configured yet" }, { status: 503 });
  const auth = authUrl(memberId, url.origin);
  if (!auth) return NextResponse.json({ error: "Google is not configured yet" }, { status: 503 });
  return NextResponse.redirect(auth);
}
