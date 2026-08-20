import { NextResponse } from "next/server";
import { canSchedule, canManageTeam } from "@/lib/booking/admin";
import { getAvailability, setAvailability } from "@/lib/booking/db";
import type { WorkingHours } from "@/lib/booking/availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deny = () => NextResponse.json({ error: "Not authorized" }, { status: 401 });
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function GET(req: Request) {
  if (!(await canSchedule())) return deny();
  const memberId = new URL(req.url).searchParams.get("memberId") || "";
  if (!memberId) return NextResponse.json({ error: "memberId required" }, { status: 400 });
  return NextResponse.json({ rules: await getAvailability(memberId) });
}

export async function POST(req: Request) {
  if (!(await canManageTeam())) return deny();
  const d = await req.json().catch(() => ({}));
  const memberId = String(d.memberId || "");
  if (!memberId) return NextResponse.json({ error: "memberId required" }, { status: 400 });
  const raw = Array.isArray(d.rules) ? d.rules : [];
  const rules: WorkingHours[] = [];
  for (const r of raw) {
    const weekday = Number(r.weekday);
    const start = String(r.start || "");
    const end = String(r.end || "");
    if (weekday < 0 || weekday > 6 || !HHMM.test(start) || !HHMM.test(end) || start >= end) continue;
    rules.push({ weekday, start, end });
  }
  await setAvailability(memberId, rules);
  return NextResponse.json({ ok: true, rules });
}
