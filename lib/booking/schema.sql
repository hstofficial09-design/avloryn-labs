-- Avloryn Meetings — Supabase schema.
-- Run once in Supabase → SQL Editor. Safe to re-run (IF NOT EXISTS).
-- RLS is ON with no public policies, so ONLY the server (service-role key, which
-- bypasses RLS) can read/write — the anon/public key can touch nothing here.

create extension if not exists "pgcrypto";

-- Team members (organizer + employees).
create table if not exists booking_members (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  email        text,
  timezone     text not null default 'Asia/Kolkata',
  active       boolean not null default true,
  is_organizer boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Each member's connected Google account + OAuth tokens (server-only).
create table if not exists booking_google (
  member_id     uuid primary key references booking_members(id) on delete cascade,
  google_email  text,
  access_token  text,
  refresh_token text,
  expiry        timestamptz,
  calendar_id   text not null default 'primary',
  scope         text,
  updated_at    timestamptz not null default now()
);

-- Meeting types (services). member_ids = eligible members; mode: 'any' (client picks
-- one / round-robin) or 'all' (every listed member attends — group/panel).
create table if not exists booking_meeting_types (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  slug                 text unique not null,
  duration_min         int  not null default 30,
  buffer_before_min    int  not null default 0,
  buffer_after_min     int  not null default 0,
  min_notice_min       int  not null default 120,
  slot_granularity_min int  not null default 30,
  mode                 text not null default 'any',      -- 'any' | 'all'
  member_ids           uuid[] not null default '{}',
  description          text default '',
  active               boolean not null default true,
  created_at           timestamptz not null default now()
);

-- Per-member weekly working hours (in the member's own timezone).
create table if not exists booking_availability (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references booking_members(id) on delete cascade,
  weekday    int  not null,          -- 0=Sun … 6=Sat
  start_time text not null,          -- 'HH:MM'
  end_time   text not null           -- 'HH:MM'
);
create index if not exists booking_availability_member on booking_availability(member_id);

-- Confirmed / cancelled bookings.
create table if not exists bookings (
  id              uuid primary key default gen_random_uuid(),
  meeting_type_id uuid references booking_meeting_types(id) on delete set null,
  member_ids      uuid[] not null default '{}',
  client_name     text not null,
  client_email    text not null,
  client_notes    text default '',
  client_timezone text,
  start_utc       timestamptz not null,
  end_utc         timestamptz not null,
  google_event_id text,
  meet_link       text,
  status          text not null default 'confirmed',   -- 'confirmed' | 'cancelled'
  cancel_token    text unique,
  created_at      timestamptz not null default now()
);
create index if not exists bookings_start on bookings(start_utc);

-- ── v1 feature columns / tables (safe to re-run) ────────────────────────────
-- Reminders: when we last emailed a reminder for a booking.
alter table bookings add column if not exists reminded_at timestamptz;
-- Custom intake answers the client gave, e.g. [{"q":"Company","a":"Acme"}].
alter table bookings add column if not exists answers jsonb not null default '[]'::jsonb;
-- Custom intake questions per meeting type, e.g. [{"id":"company","label":"Company","required":true}].
alter table booking_meeting_types add column if not exists questions jsonb not null default '[]'::jsonb;
-- How many days ahead a client may book.
alter table booking_meeting_types add column if not exists max_advance_days int not null default 60;
-- Send an automatic thank-you / feedback email after the meeting ends.
alter table booking_meeting_types add column if not exists followup_enabled boolean not null default false;
-- Manual approval: bookings start "pending" and the organizer confirms them.
alter table booking_meeting_types add column if not exists requires_approval boolean not null default false;
-- Chosen organizer/host member (creates the Google event + Meet link). Null = first connected.
alter table booking_meeting_types add column if not exists organizer_id uuid;
-- Optional list of selectable durations (minutes); empty = just duration_min.
alter table booking_meeting_types add column if not exists durations jsonb not null default '[]'::jsonb;
-- Price to charge at booking (INR). 0 = free.
alter table booking_meeting_types add column if not exists price_inr int not null default 0;

-- Payment + coupon on a booking.
alter table bookings add column if not exists payment_id text;
alter table bookings add column if not exists amount_inr int;
alter table bookings add column if not exists coupon_code text;

-- Discount coupons (optional, used with paid meeting types).
create table if not exists booking_coupons (
  code        text primary key,
  kind        text not null default 'percent',   -- 'percent' | 'flat'
  value       int  not null default 0,
  active      boolean not null default true,
  max_uses    int  not null default 0,           -- 0 = unlimited
  uses        int  not null default 0,
  created_at  timestamptz not null default now()
);

-- Post-meeting follow-up state + attendance (for no-show analytics).
alter table bookings add column if not exists followed_up_at timestamptz;
alter table bookings add column if not exists attendance text;   -- null | 'attended' | 'no_show'
-- Mirrored Zoho Calendar events, JSON [{"memberId":..,"eventUid":..,"calUid":..}].
alter table bookings add column if not exists zoho_event_id text;

-- Each member's connected Zoho account + OAuth tokens (server-only). Optional — only
-- needed for members who use Zoho Calendar instead of / in addition to Google.
create table if not exists booking_zoho (
  member_id     uuid primary key references booking_members(id) on delete cascade,
  zoho_email    text,
  access_token  text,
  refresh_token text,
  expiry        timestamptz,
  api_domain    text,           -- e.g. https://www.zohoapis.in
  calendar_uid  text,           -- default calendar uid
  scope         text,
  updated_at    timestamptz not null default now()
);

-- Per-member days off (blackout dates) in the member's own timezone.
create table if not exists booking_blackouts (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references booking_members(id) on delete cascade,
  day        date not null,           -- YYYY-MM-DD (member-local)
  created_at timestamptz not null default now(),
  unique (member_id, day)
);
create index if not exists booking_blackouts_member on booking_blackouts(member_id);

-- Lock everything to the server (service-role) only.
alter table booking_members       enable row level security;
alter table booking_google        enable row level security;
alter table booking_meeting_types enable row level security;
alter table booking_availability  enable row level security;
alter table bookings              enable row level security;
alter table booking_blackouts     enable row level security;
alter table booking_zoho          enable row level security;
alter table booking_coupons       enable row level security;
