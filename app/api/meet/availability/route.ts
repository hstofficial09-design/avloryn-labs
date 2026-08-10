import { NextResponse } from "next/server";
import { getMeetingTypeBySlug, type MeetingType } from "@/lib/booking/db";
import { slotsForMeetingType } from "@/lib/booking/slots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = 24 * 3600 * 1000;
const mtSummary = (mt: MeetingType) => ({
  name: mt.name, slug: mt.slug, duration_min: mt.duration_min, mode: mt.mode,
  questions: mt.questions ?? [], max_advance_days: mt.max_advance_days ?? 60,
  durations: mt.durations ?? [], price_inr: mt.price_inr ?? 0, requires_approval: !!mt.requires_approval,
});
const pickDuration = (mt: MeetingType, req: unknown): number => {
  const n = Math.round(Number(req) || 0);
  const allowed = (mt.durations && mt.durations.length) ? mt.durations : [mt.duration_min];
  return allowed.includes(n) ? n : mt.duration_min;
};

export async function POST(req: Request) {
  const d = await req.json().catch(() => ({}));
  const mt = await getMeetingTypeBySlug(String(d.slug || ""));
  if (!mt || !mt.active) return NextResponse.json({ error: "Unknown meeting type" }, { status: 404 });

  const fromMs = Date.parse(String(d.fromISO || ""));
  let toMs = Date.parse(String(d.toISO || ""));
  if (Number.isNaN(fromMs) || Number.isNaN(toMs) || toMs <= fromMs) {
    return NextResponse.json({ error: "Valid fromISO / toISO required" }, { status: 400 });
  }
  // Never allow booking further ahead than the meeting type permits.
  const maxAdvance = (mt.max_advance_days ?? 60) * DAY;
  const hardMax = Date.now() + maxAdvance;
  if (toMs > hardMax) toMs = hardMax;
  if (toMs <= fromMs) return NextResponse.json({ meetingType: mtSummary(mt), slots: [] });

  const pick = Array.isArray(d.memberIds) ? d.memberIds.map(String) : undefined;
  const duration = pickDuration(mt, d.duration);
  try {
    const slots = await slotsForMeetingType(mt, new Date(fromMs).toISOString(), new Date(toMs).toISOString(), pick, duration);
    return NextResponse.json({ meetingType: mtSummary(mt), slots });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not load availability" }, { status: 500 });
  }
}
