import { NextResponse } from "next/server";
import crypto from "crypto";
import { hashPassword } from "@/lib/portal-auth";
import { getEmployeeByResetToken, completePasswordReset } from "@/lib/portal-db";

export const runtime = "nodejs";

// Public: completes the forgot-password flow using the emailed token.
export async function POST(req: Request) {
  const d = await req.json().catch(() => ({}));
  const token = String(d.token || "");
  const next = String(d.new || "");
  if (!token || next.length < 4) {
    return NextResponse.json({ error: "A valid link and a password (min 4 characters) are required" }, { status: 400 });
  }
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const emp = await getEmployeeByResetToken(tokenHash);
  if (!emp || !emp.reset_expires || new Date(emp.reset_expires).getTime() < Date.now()) {
    return NextResponse.json({ error: "This reset link is invalid or has expired. Please request a new one." }, { status: 400 });
  }
  await completePasswordReset(emp.id, hashPassword(next));
  return NextResponse.json({ success: true });
}
