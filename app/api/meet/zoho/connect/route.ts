import { NextResponse } from "next/server";
import { verifyMemberToken } from "@/lib/booking/link";
import { zohoAuthUrl, zohoConfigured } from "@/lib/booking/zoho";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A member opens this signed link to connect their Zoho Calendar.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const memberId = verifyMemberToken(url.searchParams.get("t"));
  if (!memberId) return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
  if (!zohoConfigured()) return NextResponse.json({ error: "Zoho is not configured yet" }, { status: 503 });
  const auth = zohoAuthUrl(memberId, url.origin);
  if (!auth) return NextResponse.json({ error: "Zoho is not configured yet" }, { status: 503 });
  return NextResponse.redirect(auth);
}
