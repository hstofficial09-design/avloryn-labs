import { NextResponse } from "next/server";
import { connectMember } from "@/lib/booking/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Google redirects here after consent. state = member id (set when we built the auth URL).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const done = (status: string, email?: string) =>
    NextResponse.redirect(`${url.origin}/meet/connected?status=${status}${email ? `&email=${encodeURIComponent(email)}` : ""}`);

  if (url.searchParams.get("error")) return done("denied");
  const code = url.searchParams.get("code");
  const memberId = url.searchParams.get("state");
  if (!code || !memberId) return done("error");

  try {
    const { email } = await connectMember(memberId, code, url.origin);
    return done("ok", email || undefined);
  } catch {
    return done("error");
  }
}
