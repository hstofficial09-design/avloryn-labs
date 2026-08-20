import { NextResponse } from "next/server";
import { canSchedule, canManageTeam } from "@/lib/booking/admin";
import { getBlackoutDays, addBlackout, deleteBlackout } from "@/lib/booking/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deny = () => NextResponse.json({ error: "Not authorized" }, { status: 401 });
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  if (!(await canSchedule())) return deny();
  const memberId = new URL(req.url).searchParams.get("memberId") || "";
  if (!memberId) return NextResponse.json({ error: "memberId required" }, { status: 400 });
  return NextResponse.json({ days: await getBlackoutDays(memberId) });
}

export async function POST(req: Request) {
  if (!(await canManageTeam())) return deny();
  const d = await req.json().catch(() => ({}));
  const memberId = String(d.memberId || "");
  const day = String(d.day || "");
  if (!memberId || !DAY_RE.test(day)) return NextResponse.json({ error: "memberId + YYYY-MM-DD day required" }, { status: 400 });
  await addBlackout(memberId, day);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await canManageTeam())) return deny();
  const sp = new URL(req.url).searchParams;
  const memberId = sp.get("memberId") || "", day = sp.get("day") || "";
  if (!memberId || !day) return NextResponse.json({ error: "memberId + day required" }, { status: 400 });
  await deleteBlackout(memberId, day);
  return NextResponse.json({ ok: true });
}
