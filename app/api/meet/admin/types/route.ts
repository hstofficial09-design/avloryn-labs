import { NextResponse } from "next/server";
import { canSchedule } from "@/lib/booking/admin";
import { listMeetingTypes, createMeetingType, updateMeetingType, deleteMeetingType } from "@/lib/booking/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deny = () => NextResponse.json({ error: "Not authorized" }, { status: 401 });
const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "meeting";
// Sanitise custom intake questions → [{id,label,required}] with stable slug ids.
const QUESTION_TYPES = new Set(["text", "textarea", "email", "phone", "number", "select", "date"]);
function cleanQuestions(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: { id: string; label: string; required: boolean; type: string; options?: string[] }[] = [];
  for (const q of raw.slice(0, 20)) {
    const label = String((q as any)?.label || "").trim().slice(0, 120);
    if (!label) continue;
    let id = slugify(label).slice(0, 40) || "q";
    while (seen.has(id)) id += "x";
    seen.add(id);
    const type = QUESTION_TYPES.has(String((q as any)?.type)) ? String((q as any).type) : "text";
    let options: string[] | undefined;
    if (type === "select") {
      const raw2 = (q as any)?.options;
      options = (Array.isArray(raw2) ? raw2 : []).map((o: unknown) => String(o).trim()).filter(Boolean).slice(0, 25);
      if (!options.length) options = undefined;
    }
    out.push({ id, label, required: !!(q as any)?.required, type, ...(options ? { options } : {}) });
  }
  return out;
}
// Selectable durations → sorted unique positive ints (max 6).
function cleanDurations(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set<number>();
  for (const x of raw) { const n = Math.round(Number(x)); if (n > 0 && n <= 600) set.add(n); }
  return [...set].sort((a, b) => a - b).slice(0, 6);
}
// Reminder offsets (minutes before start) → sorted unique, 1 min … 7 days, max 6.
function cleanReminders(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set<number>();
  for (const x of raw) { const n = Math.round(Number(x)); if (n > 0 && n <= 10080) set.add(n); }
  return [...set].sort((a, b) => a - b).slice(0, 6);
}

export async function GET() {
  if (!(await canSchedule())) return deny();
  return NextResponse.json({ types: await listMeetingTypes() });
}

export async function POST(req: Request) {
  if (!(await canSchedule())) return deny();
  const d = await req.json().catch(() => ({}));
  const name = String(d.name || "").trim();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const memberIds = Array.isArray(d.member_ids) ? d.member_ids.map(String) : [];
  if (!memberIds.length) return NextResponse.json({ error: "Pick at least one member" }, { status: 400 });
  const t = await createMeetingType({
    name,
    slug: slugify(d.slug || name),
    duration_min: Number(d.duration_min) || 30,
    buffer_before_min: Number(d.buffer_before_min) || 0,
    buffer_after_min: Number(d.buffer_after_min) || 0,
    min_notice_min: Number(d.min_notice_min) || 0,
    slot_granularity_min: Number(d.slot_granularity_min) || 30,
    mode: d.mode === "all" ? "all" : "any",
    member_ids: memberIds,
    description: String(d.description || ""),
    max_advance_days: Math.min(365, Math.max(1, Number(d.max_advance_days) || 60)),
    questions: cleanQuestions(d.questions),
    followup_enabled: !!d.followup_enabled,
    requires_approval: !!d.requires_approval,
    durations: cleanDurations(d.durations),
    reminders: cleanReminders(d.reminders),
    price_inr: Math.max(0, Math.round(Number(d.price_inr) || 0)),
    organizer_id: d.organizer_id && memberIds.includes(String(d.organizer_id)) ? String(d.organizer_id) : null,
  });
  return NextResponse.json({ type: t });
}

export async function PATCH(req: Request) {
  if (!(await canSchedule())) return deny();
  const d = await req.json().catch(() => ({}));
  const id = String(d.id || "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  for (const k of [
    "name", "duration_min", "buffer_before_min", "buffer_after_min", "min_notice_min",
    "slot_granularity_min", "mode", "member_ids", "description", "active",
    "max_advance_days", "followup_enabled", "requires_approval", "price_inr",
  ]) {
    if (k in d) patch[k] = d[k];
  }
  if ("questions" in d) patch.questions = cleanQuestions(d.questions);
  if ("durations" in d) patch.durations = cleanDurations(d.durations);
  if ("reminders" in d) patch.reminders = cleanReminders(d.reminders);
  if ("organizer_id" in d) patch.organizer_id = d.organizer_id ? String(d.organizer_id) : null;
  if ("slug" in d && d.slug) patch.slug = slugify(d.slug);
  const t = await updateMeetingType(id, patch);
  return NextResponse.json({ type: t });
}

export async function DELETE(req: Request) {
  if (!(await canSchedule())) return deny();
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteMeetingType(id);
  return NextResponse.json({ ok: true });
}
