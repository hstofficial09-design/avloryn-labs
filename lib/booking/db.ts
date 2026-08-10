/**
 * Avloryn Meetings — data layer (Supabase, server-only).
 * Uses the service-role client (bypasses RLS). Never import from a client component.
 * Every function degrades gracefully (returns null/[]) when Supabase isn't configured.
 */
import { getSupabaseAdmin } from "@/lib/supabase";
import type { WorkingHours } from "./availability";

export type Member = {
  id: string; name: string; email: string | null; timezone: string;
  active: boolean; is_organizer: boolean; created_at?: string; has_google?: boolean;
};
export type GoogleTokens = {
  member_id: string; google_email: string | null; access_token: string | null;
  refresh_token: string | null; expiry: string | null; calendar_id: string; scope: string | null;
};
export type IntakeQuestion = { id: string; label: string; required: boolean };
export type IntakeAnswer = { q: string; a: string };
export type MeetingType = {
  id: string; name: string; slug: string; duration_min: number;
  buffer_before_min: number; buffer_after_min: number; min_notice_min: number;
  slot_granularity_min: number; mode: "any" | "all"; member_ids: string[];
  description: string; active: boolean;
  questions?: IntakeQuestion[]; max_advance_days?: number; followup_enabled?: boolean;
  requires_approval?: boolean; durations?: number[]; price_inr?: number; organizer_id?: string | null;
};
export type Booking = {
  id: string; meeting_type_id: string | null; member_ids: string[];
  client_name: string; client_email: string; client_notes: string; client_timezone: string | null;
  start_utc: string; end_utc: string; google_event_id: string | null; meet_link: string | null;
  status: string; cancel_token: string | null; created_at?: string;
  answers?: IntakeAnswer[]; reminded_at?: string | null; zoho_event_id?: string | null;
  followed_up_at?: string | null; attendance?: "attended" | "no_show" | null;
  payment_id?: string | null; amount_inr?: number | null; coupon_code?: string | null;
};

const db = () => getSupabaseAdmin();

// ── Members ──────────────────────────────────────────────────────────────────
export async function listMembers(activeOnly = false): Promise<Member[]> {
  const s = db(); if (!s) return [];
  let q = s.from("booking_members").select("*").order("is_organizer", { ascending: false }).order("created_at");
  if (activeOnly) q = q.eq("active", true);
  const { data } = await q;
  return (data as Member[]) || [];
}
export async function getMember(id: string): Promise<Member | null> {
  const s = db(); if (!s) return null;
  const { data } = await s.from("booking_members").select("*").eq("id", id).maybeSingle();
  return (data as Member) || null;
}
export async function addMember(m: { name: string; email?: string; timezone?: string; is_organizer?: boolean }) {
  const s = db(); if (!s) throw new Error("Supabase not configured");
  const { data, error } = await s.from("booking_members")
    .insert({ name: m.name.trim(), email: (m.email || "").trim() || null, timezone: m.timezone || "Asia/Kolkata", is_organizer: !!m.is_organizer })
    .select("id").single();
  if (error) throw new Error(error.message);
  return { id: (data as any).id as string };
}
export async function updateMember(id: string, fields: Partial<Pick<Member, "name" | "email" | "timezone" | "active" | "is_organizer">>) {
  const s = db(); if (!s) throw new Error("Supabase not configured");
  const { error } = await s.from("booking_members").update(fields).eq("id", id);
  if (error) throw new Error(error.message);
}
export async function deleteMember(id: string) {
  const s = db(); if (!s) throw new Error("Supabase not configured");
  await s.from("booking_members").delete().eq("id", id); // cascades google + availability
}

// ── Google tokens ────────────────────────────────────────────────────────────
export async function getGoogle(memberId: string): Promise<GoogleTokens | null> {
  const s = db(); if (!s) return null;
  const { data } = await s.from("booking_google").select("*").eq("member_id", memberId).maybeSingle();
  return (data as GoogleTokens) || null;
}
export async function saveGoogle(memberId: string, t: Partial<GoogleTokens>) {
  const s = db(); if (!s) throw new Error("Supabase not configured");
  const { error } = await s.from("booking_google")
    .upsert({ member_id: memberId, ...t, updated_at: new Date().toISOString() }, { onConflict: "member_id" });
  if (error) throw new Error(error.message);
}
export async function membersWithGoogle(ids: string[]): Promise<Set<string>> {
  const s = db(); if (!s || !ids.length) return new Set();
  const { data } = await s.from("booking_google").select("member_id").in("member_id", ids).not("refresh_token", "is", null);
  return new Set((data || []).map((r: any) => r.member_id));
}

// ── Meeting types ────────────────────────────────────────────────────────────
export async function listMeetingTypes(activeOnly = false): Promise<MeetingType[]> {
  const s = db(); if (!s) return [];
  let q = s.from("booking_meeting_types").select("*").order("created_at");
  if (activeOnly) q = q.eq("active", true);
  const { data } = await q;
  return (data as MeetingType[]) || [];
}
export async function getMeetingTypeBySlug(slug: string): Promise<MeetingType | null> {
  const s = db(); if (!s) return null;
  const { data } = await s.from("booking_meeting_types").select("*").eq("slug", slug).maybeSingle();
  return (data as MeetingType) || null;
}
export async function getMeetingTypeById(id: string): Promise<MeetingType | null> {
  const s = db(); if (!s) return null;
  const { data } = await s.from("booking_meeting_types").select("*").eq("id", id).maybeSingle();
  return (data as MeetingType) || null;
}
export async function createMeetingType(m: Partial<MeetingType> & { name: string; slug: string }) {
  const s = db(); if (!s) throw new Error("Supabase not configured");
  const { error } = await s.from("booking_meeting_types").insert({
    name: m.name.trim(), slug: m.slug.trim().toLowerCase(),
    duration_min: m.duration_min ?? 30, buffer_before_min: m.buffer_before_min ?? 0,
    buffer_after_min: m.buffer_after_min ?? 0, min_notice_min: m.min_notice_min ?? 120,
    slot_granularity_min: m.slot_granularity_min ?? 30, mode: m.mode ?? "any",
    member_ids: m.member_ids ?? [], description: m.description ?? "", active: m.active ?? true,
    questions: m.questions ?? [], max_advance_days: m.max_advance_days ?? 60,
    followup_enabled: m.followup_enabled ?? false,
    requires_approval: m.requires_approval ?? false, durations: m.durations ?? [], price_inr: m.price_inr ?? 0,
    organizer_id: m.organizer_id ?? null,
  });
  if (error) throw new Error(error.message);
}
export async function updateMeetingType(id: string, fields: Partial<MeetingType>) {
  const s = db(); if (!s) throw new Error("Supabase not configured");
  const { error } = await s.from("booking_meeting_types").update(fields).eq("id", id);
  if (error) throw new Error(error.message);
}
export async function deleteMeetingType(id: string) {
  const s = db(); if (!s) return;
  await s.from("booking_meeting_types").delete().eq("id", id);
}

// ── Availability (working hours) ─────────────────────────────────────────────
export async function getAvailability(memberId: string): Promise<WorkingHours[]> {
  const s = db(); if (!s) return [];
  const { data } = await s.from("booking_availability").select("weekday,start_time,end_time").eq("member_id", memberId);
  return (data || []).map((r: any) => ({ weekday: r.weekday, start: r.start_time, end: r.end_time }));
}
export async function setAvailability(memberId: string, rules: WorkingHours[]) {
  const s = db(); if (!s) throw new Error("Supabase not configured");
  await s.from("booking_availability").delete().eq("member_id", memberId);
  if (rules.length) {
    const rows = rules.map((r) => ({ member_id: memberId, weekday: r.weekday, start_time: r.start, end_time: r.end }));
    const { error } = await s.from("booking_availability").insert(rows);
    if (error) throw new Error(error.message);
  }
}

// ── Bookings ─────────────────────────────────────────────────────────────────
export async function createBooking(b: Omit<Booking, "id" | "status" | "created_at">, status = "confirmed"): Promise<Booking> {
  const s = db(); if (!s) throw new Error("Supabase not configured");
  const { data, error } = await s.from("bookings").insert({ ...b, status }).select("*").single();
  if (error) throw new Error(error.message);
  return data as Booking;
}
export async function getBookingByCancelToken(token: string): Promise<Booking | null> {
  const s = db(); if (!s) return null;
  const { data } = await s.from("bookings").select("*").eq("cancel_token", token).maybeSingle();
  return (data as Booking) || null;
}
export async function markBookingCancelled(id: string) {
  const s = db(); if (!s) return;
  await s.from("bookings").update({ status: "cancelled" }).eq("id", id);
}
/** Approve a pending booking: attach the freshly-created calendar events + confirm it. */
export async function confirmBooking(id: string, fields: { google_event_id?: string | null; meet_link?: string | null; zoho_event_id?: string | null }) {
  const s = db(); if (!s) throw new Error("Supabase not configured");
  const { error } = await s.from("bookings").update({ ...fields, status: "confirmed" }).eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Coupons (optional, for paid meeting types) ───────────────────────────────
export type Coupon = { code: string; kind: "percent" | "flat"; value: number; active: boolean; max_uses: number; uses: number };
export async function getCoupon(code: string): Promise<Coupon | null> {
  const s = db(); if (!s) return null;
  const { data } = await s.from("booking_coupons").select("*").eq("code", code.toUpperCase().trim()).maybeSingle();
  return (data as Coupon) || null;
}
export async function listCoupons(): Promise<Coupon[]> {
  const s = db(); if (!s) return [];
  const { data } = await s.from("booking_coupons").select("*").order("created_at", { ascending: false });
  return (data as Coupon[]) || [];
}
export async function createCoupon(c: { code: string; kind: "percent" | "flat"; value: number; max_uses?: number }) {
  const s = db(); if (!s) throw new Error("Supabase not configured");
  const { error } = await s.from("booking_coupons").upsert({ code: c.code.toUpperCase().trim(), kind: c.kind, value: c.value, max_uses: c.max_uses ?? 0, active: true });
  if (error) throw new Error(error.message);
}
export async function deleteCoupon(code: string) {
  const s = db(); if (!s) return;
  await s.from("booking_coupons").delete().eq("code", code.toUpperCase().trim());
}
export async function incrementCouponUse(code: string) {
  const s = db(); if (!s) return;
  const c = await getCoupon(code); if (!c) return;
  await s.from("booking_coupons").update({ uses: (c.uses || 0) + 1 }).eq("code", c.code);
}
export async function updateBookingTime(id: string, startISO: string, endISO: string) {
  const s = db(); if (!s) throw new Error("Supabase not configured");
  const { error } = await s.from("bookings").update({ start_utc: startISO, end_utc: endISO }).eq("id", id);
  if (error) throw new Error(error.message);
}
export async function listBookings(opts: { from?: string; to?: string; status?: string } = {}): Promise<Booking[]> {
  const s = db(); if (!s) return [];
  let q = s.from("bookings").select("*").order("start_utc", { ascending: false }).limit(500);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.from) q = q.gte("start_utc", opts.from);
  if (opts.to) q = q.lte("start_utc", opts.to);
  const { data } = await q;
  return (data as Booking[]) || [];
}
export async function getBookingById(id: string): Promise<Booking | null> {
  const s = db(); if (!s) return null;
  const { data } = await s.from("bookings").select("*").eq("id", id).maybeSingle();
  return (data as Booking) || null;
}
export async function setBookingAttendance(id: string, attendance: "attended" | "no_show" | null) {
  const s = db(); if (!s) throw new Error("Supabase not configured");
  const { error } = await s.from("bookings").update({ attendance }).eq("id", id);
  if (error) throw new Error(error.message);
}
/** Round-robin helper: how many upcoming confirmed bookings each member currently has. */
export async function upcomingCountByMember(memberIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const id of memberIds) out[id] = 0;
  const s = db(); if (!s) return out;
  const { data } = await s.from("bookings").select("member_ids").eq("status", "confirmed").gte("end_utc", new Date().toISOString()).limit(1000);
  for (const row of (data as { member_ids: string[] }[]) || []) {
    for (const id of row.member_ids || []) if (id in out) out[id]++;
  }
  return out;
}
/** Bookings that need an action email now: a reminder before start, or a follow-up after end. */
export async function bookingsNeedingReminder(leadMinutes: number): Promise<Booking[]> {
  const s = db(); if (!s) return [];
  const now = new Date();
  const until = new Date(now.getTime() + leadMinutes * 60000).toISOString();
  const { data } = await s.from("bookings").select("*")
    .eq("status", "confirmed").is("reminded_at", null)
    .gte("start_utc", now.toISOString()).lte("start_utc", until).limit(200);
  return (data as Booking[]) || [];
}
export async function bookingsNeedingFollowup(): Promise<Booking[]> {
  const s = db(); if (!s) return [];
  const now = new Date().toISOString();
  const { data } = await s.from("bookings").select("*")
    .eq("status", "confirmed").is("followed_up_at", null)
    .lte("end_utc", now).gte("end_utc", new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()).limit(200);
  return (data as Booking[]) || [];
}
export async function markReminded(id: string) {
  const s = db(); if (!s) return;
  await s.from("bookings").update({ reminded_at: new Date().toISOString() }).eq("id", id);
}
export async function markFollowedUp(id: string) {
  const s = db(); if (!s) return;
  await s.from("bookings").update({ followed_up_at: new Date().toISOString() }).eq("id", id);
}

// ── Blackout dates (time off) ────────────────────────────────────────────────
export async function getBlackoutDays(memberId: string): Promise<string[]> {
  const s = db(); if (!s) return [];
  const { data } = await s.from("booking_blackouts").select("day").eq("member_id", memberId);
  return (data || []).map((r: any) => String(r.day));
}
export async function addBlackout(memberId: string, day: string) {
  const s = db(); if (!s) throw new Error("Supabase not configured");
  const { error } = await s.from("booking_blackouts").upsert({ member_id: memberId, day }, { onConflict: "member_id,day" });
  if (error) throw new Error(error.message);
}
export async function deleteBlackout(memberId: string, day: string) {
  const s = db(); if (!s) return;
  await s.from("booking_blackouts").delete().eq("member_id", memberId).eq("day", day);
}

// ── Zoho tokens (optional, mirrors booking_google) ───────────────────────────
export type ZohoTokens = {
  member_id: string; zoho_email: string | null; access_token: string | null;
  refresh_token: string | null; expiry: string | null; api_domain: string | null;
  calendar_uid: string | null; scope: string | null;
};
export async function getZoho(memberId: string): Promise<ZohoTokens | null> {
  const s = db(); if (!s) return null;
  const { data } = await s.from("booking_zoho").select("*").eq("member_id", memberId).maybeSingle();
  return (data as ZohoTokens) || null;
}
export async function saveZoho(memberId: string, t: Partial<ZohoTokens>) {
  const s = db(); if (!s) throw new Error("Supabase not configured");
  const { error } = await s.from("booking_zoho").upsert({ member_id: memberId, ...t, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
export async function membersWithZoho(ids: string[]): Promise<Set<string>> {
  const s = db(); if (!s || !ids.length) return new Set();
  const { data } = await s.from("booking_zoho").select("member_id").in("member_id", ids);
  return new Set((data || []).map((r: any) => r.member_id as string));
}
