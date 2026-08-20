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
export type IntakeQuestion = { id: string; label: string; required: boolean; type?: string; options?: string[] };
export type IntakeAnswer = { q: string; a: string };

/**
 * A meeting created by hand has no meeting type, so there is nowhere in the table to keep the
 * title that was typed — and every cancellation, reschedule, reminder and admin row then called
 * it "Meeting" or "—". Until `bookings` has a real title column, the title rides along in the
 * answers list under this reserved key. It is stripped before answers are shown anywhere.
 */
export const TITLE_KEY = "__title";
export const titleAnswer = (title: string): IntakeAnswer[] => [{ q: TITLE_KEY, a: title }];
/** The stored title of a hand-made meeting, if there is one. */
export const storedTitle = (b: { answers?: IntakeAnswer[] | null }): string =>
  (b.answers || []).find((a) => a.q === TITLE_KEY)?.a || "";
/** Intake answers with the reserved title row removed — what a human should actually see. */
export const visibleAnswers = (b: { answers?: IntakeAnswer[] | null }): IntakeAnswer[] =>
  (b.answers || []).filter((a) => a.q !== TITLE_KEY);
export type MeetingType = {
  id: string; name: string; slug: string; duration_min: number;
  buffer_before_min: number; buffer_after_min: number; min_notice_min: number;
  slot_granularity_min: number; mode: "any" | "all"; member_ids: string[];
  description: string; active: boolean;
  questions?: IntakeQuestion[]; max_advance_days?: number; followup_enabled?: boolean;
  requires_approval?: boolean; durations?: number[]; price_inr?: number; organizer_id?: string | null;
  reminders?: number[]; // minutes-before-start to email a reminder, e.g. [15,60,1440]
};
export type Booking = {
  id: string; meeting_type_id: string | null; member_ids: string[];
  client_name: string; client_email: string; client_notes: string; client_timezone: string | null;
  start_utc: string; end_utc: string; google_event_id: string | null; meet_link: string | null;
  status: string; cancel_token: string | null; created_at?: string;
  answers?: IntakeAnswer[]; reminded_at?: string | null; reminders_sent?: number[]; zoho_event_id?: string | null;
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
/**
 * Switch someone off (or back on) in scheduling, found by their work email.
 *
 * Used when the owner removes a person from the team: scheduling lives in a different database,
 * so nothing here happened automatically and a leaver stayed bookable.
 *
 * Deactivated, never deleted. Bookings store member ids, so removing the row leaves past meetings
 * pointing at an id that resolves to nobody — which is exactly how the orphaned bookings in the
 * calendar came about. Deactivating takes them out of the pickers and off future bookings while
 * their name still resolves on the meetings they actually attended.
 *
 * Returns how many rows changed, so the caller can tell the owner what really happened.
 */
export async function setMemberActiveByEmail(email: string, active: boolean): Promise<number> {
  const s = db(); if (!s || !email.trim()) return 0;
  const { data, error } = await s.from("booking_members")
    .update({ active })
    .ilike("email", email.trim())
    .select("id");
  if (error) throw new Error(error.message);
  return (data || []).length;
}

/** Confirmed meetings still to come that this member is on — the owner needs to reassign these. */
export async function upcomingForMemberEmail(email: string): Promise<{ id: string; start_utc: string; client_name: string }[]> {
  const s = db(); if (!s || !email.trim()) return [];
  const { data: mem } = await s.from("booking_members").select("id").ilike("email", email.trim());
  const ids = (mem || []).map((m: any) => m.id);
  if (!ids.length) return [];
  const { data } = await s.from("bookings").select("id,start_utc,client_name,member_ids")
    .eq("status", "confirmed").gte("start_utc", new Date().toISOString());
  return (data || [])
    .filter((b: any) => (b.member_ids || []).some((x: string) => ids.includes(x)))
    .map((b: any) => ({ id: b.id, start_utc: b.start_utc, client_name: b.client_name }));
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
  const row: Record<string, unknown> = {
    name: m.name.trim(), slug: m.slug.trim().toLowerCase(),
    duration_min: m.duration_min ?? 30, buffer_before_min: m.buffer_before_min ?? 0,
    buffer_after_min: m.buffer_after_min ?? 0, min_notice_min: m.min_notice_min ?? 120,
    slot_granularity_min: m.slot_granularity_min ?? 30, mode: m.mode ?? "any",
    member_ids: m.member_ids ?? [], description: m.description ?? "", active: m.active ?? true,
    questions: m.questions ?? [], max_advance_days: m.max_advance_days ?? 60,
    followup_enabled: m.followup_enabled ?? false,
    requires_approval: m.requires_approval ?? false, durations: m.durations ?? [], price_inr: m.price_inr ?? 0,
    organizer_id: m.organizer_id ?? null, reminders: m.reminders ?? [],
  };
  let { error } = await s.from("booking_meeting_types").insert(row);
  // Degrade gracefully if the reminders column hasn't been migrated yet.
  if (error && /reminders/i.test(error.message)) { delete row.reminders; ({ error } = await s.from("booking_meeting_types").insert(row)); }
  if (error) throw new Error(error.message);
}
export async function updateMeetingType(id: string, fields: Partial<MeetingType>) {
  const s = db(); if (!s) throw new Error("Supabase not configured");
  let { error } = await s.from("booking_meeting_types").update(fields).eq("id", id);
  if (error && /reminders/i.test(error.message) && "reminders" in fields) {
    const rest = { ...fields }; delete (rest as Record<string, unknown>).reminders;
    ({ error } = await s.from("booking_meeting_types").update(rest).eq("id", id));
  }
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
/** Confirmed meetings still to come — what the calendar→app sync has to keep an eye on. */
export async function listUpcomingConfirmed(): Promise<Booking[]> {
  const s = db(); if (!s) return [];
  const { data } = await s.from("bookings").select("*")
    .eq("status", "confirmed")
    .gte("start_utc", new Date().toISOString())
    .order("start_utc")
    .limit(200);
  return (data as Booking[]) || [];
}

/** A meeting that moved needs its reminder to fire again for the NEW time. */
export async function clearReminderMark(id: string) {
  const s = db(); if (!s) return;
  const { error } = await s.from("bookings").update({ reminders_sent: [], reminded_at: null }).eq("id", id);
  if (error) await s.from("bookings").update({ reminded_at: null }).eq("id", id);
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
/** Upcoming confirmed bookings starting within [now, now+maxLeadMin]. The cron decides which
 *  per-type reminder offsets still need sending by comparing against each booking's reminders_sent. */
export async function bookingsNeedingAnyReminder(maxLeadMin: number): Promise<Booking[]> {
  const s = db(); if (!s) return [];
  const now = new Date();
  const until = new Date(now.getTime() + maxLeadMin * 60000).toISOString();
  const { data } = await s.from("bookings").select("*")
    .eq("status", "confirmed")
    .gte("start_utc", now.toISOString()).lte("start_utc", until).limit(300);
  return (data as Booking[]) || [];
}
/**
 * Record that a booking's reminder(s) went out. Returns false if we could NOT record it — the
 * caller must then not send, because an unrecorded reminder is re-sent on every cron run (that is
 * a reminder email every 15 minutes until the meeting starts).
 *
 * `reminders_sent` (per-offset) is not present on every deployment; where it is missing we fall
 * back to the plain `reminded_at` timestamp, which gives one reminder per booking instead of one
 * per offset. Degraded, but never a loop.
 */
export async function markReminderSent(id: string, offsets: number[]): Promise<boolean> {
  const s = db(); if (!s) return false;
  const { error } = await s.from("bookings")
    .update({ reminders_sent: offsets, reminded_at: new Date().toISOString() }).eq("id", id);
  if (!error) return true;
  const { error: e2 } = await s.from("bookings")
    .update({ reminded_at: new Date().toISOString() }).eq("id", id);
  if (!e2) {
    console.warn(`[reminders] no reminders_sent column (${error.message}) — falling back to one reminder per booking`);
    return true;
  }
  console.error(`[reminders] could not mark booking ${id} as reminded, so nothing was sent: ${e2.message}`);
  return false;
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
