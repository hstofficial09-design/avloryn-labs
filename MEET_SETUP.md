# Meeting Booking System — Setup (owner)

A custom, Zoho-Bookings-style scheduler built into avloryn.com. No paid SaaS — it uses free
Google APIs + our existing Supabase + Resend. Multi-member: each teammate connects **any**
Google account (any domain); the organizer assembles meeting types; everyone's calendar stays
in sync and every meeting gets a real Google Meet link.

The **code is done and the build is green.** It stays dormant until the 3 steps below are done.

---

## What you get

- **Organizer console** at `/meet/admin` (owner-login only, reuses the Partner Portal owner login).
  - Add team members → each gets a private **"connect link"** you send them; they open it and grant
    Google Calendar access (their own account, any domain).
  - Create **meeting types**: duration, buffers, min-notice, "1-on-1 (any member)" vs
    "group (all attend)", and which members. Each type gets a **shareable booking link**
    `https://avloryn.com/meet/<name>` — copy it and send it to people.
  - Set each member's **weekly availability**; see all **bookings** + Meet links.
- **Public booking page** `/meet/<slug>`: the person picks a time (shown in *their* timezone,
  only slots where the member(s) are genuinely free), enters name/email → gets a Google Meet link +
  a branded confirmation email with **cancel** and **reschedule** links + a universal `.ics` invite.
- **Guaranteed auto-add:** the meeting is written to *each* connected member's own calendar using
  their token (it just appears — no "accept the invite" step). The client gets a Google invite +
  our `.ics`, so their calendar (Google, Outlook, Apple, Zoho — anything) can add it too.
- **Free-slot logic** uses every attending member's live Google free/busy — so a member must connect
  their Google account for their calendar to be respected.
- **Cancel** removes the meeting from every member's calendar; **reschedule** moves it (same Meet link)
  and re-sends an updated invite.
- Double-booking-safe: the slot is re-checked against live free/busy at the moment of booking.

---

## Step 1 — Create the database tables (2 min)

Open **Supabase → SQL Editor**, paste the contents of [`lib/booking/schema.sql`](lib/booking/schema.sql),
and run it. (Safe to re-run; it uses `create table if not exists`.)

## Step 2 — Google Cloud OAuth (10 min, one-time)

1. [console.cloud.google.com](https://console.cloud.google.com) → create/pick a project.
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **OAuth consent screen** → External → app name "Avloryn Labs Scheduling", support email = yours →
   add each teammate's Google address under **Test users** (until you publish the app).
4. **Credentials → Create credentials → OAuth client ID → Web application.**
   - Authorized redirect URIs:
     - `https://avloryn.com/api/meet/google/callback`
     - `http://localhost:3000/api/meet/google/callback` (for local testing)
   - Save the **Client ID** and **Client secret**.

## Step 3 — Environment variables (Netlify → Site settings → Environment variables)

Required for Google (calendar + Meet):
```
GOOGLE_CLIENT_ID=<from step 2>
GOOGLE_CLIENT_SECRET=<from step 2>
```
For automatic reminders + post-meeting follow-up (the Netlify scheduled function calls the
cron endpoint every 15 min — set any long random string):
```
CRON_SECRET=<any long random string>
```
Optional (defaults to the portal session secret if unset):
```
MEET_LINK_SECRET=<any long random string>
```
Optional — **payments** (paid meeting types + coupons). Reuse your LivoDraft Razorpay keys:
```
RAZORPAY_KEY_ID=<rzp_live_… or rzp_test_…>
RAZORPAY_KEY_SECRET=<secret>
```
Optional — **Zoho Calendar** (only if a member uses Zoho instead of Google):
```
ZOHO_CLIENT_ID=<from api-console.zoho.in>
ZOHO_CLIENT_SECRET=<…>
ZOHO_REGION=in            # in | com | eu | com.au
```
Already set (reused): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
`CONTACT_FROM_EMAIL`, `CONTACT_TO_EMAIL`, and the `PORTAL_OWNER_EMAIL` / `PORTAL_OWNER_PASSWORD`
(or `ADMIN_PASSWORD`) you already use for the Partner Portal — the same owner login opens `/meet/admin`.

Redeploy after saving. Done. (Payments/Zoho stay off until their keys are set — everything else works.)

## Optional — Zoho OAuth app (only if you need Zoho Calendar)
1. [api-console.zoho.in](https://api-console.zoho.in) → **Server-based Applications** → Create.
2. Homepage URL `https://avloryn.com`, Authorized redirect URI `https://avloryn.com/api/meet/zoho/callback`.
3. Copy Client ID + Secret → env above. Then in `/meet/admin` → Members, each member gets a
   **"Zoho link"** to connect their Zoho calendar (alongside Google).

## Features (what's built)
Meeting types with duration(s), buffers before/after, min-notice, max-advance, 1-on-1 (round-robin)
or group; **custom intake questions**; **weekly availability with multiple windows/day + blackout
dates**; guaranteed **auto-add to every member's calendar** + Google Meet; universal `.ics` for the
client; **cancel + reschedule** (client links + admin); **auto reminders + post-meeting follow-up**;
**paid bookings (Razorpay) + coupons**; **manual approval workflow**; **embeddable widget** (Embed
button copies an `<iframe>`); **analytics** (per week, popular days/times, no-shows); team notification
on every booking; **Zoho Calendar mirror** (optional).

---

## First run

1. Go to `/meet/admin` → **Members** → add each teammate (name + email + timezone).
2. Copy each member's **connect link** and send it to them → they open it → "Allow" → their
   calendar shows **linked**.
3. **Meeting types** → create one (e.g. "Intro call", 30 min, 1-on-1, pick the members).
4. **Availability** → set each member's weekly hours.
5. Copy the type's **booking link** and share it. That's what people use to book you.

---

## Notes

- Until Google creds are set, the admin shows a banner and availability/Meet stay off — everything
  else (members, types, links) still works, so you can set it all up first.
- Meet links + calendar invites are created on the **host** member's calendar (first connected member
  of that meeting type). Attendees + the client get the Google invite automatically.
- Cancel link in the confirmation email removes the event from everyone's calendar.
- Phase 2 (later, not built): Zoho Calendar two-way sync, reschedule, automated reminders.

## Files (for the developer)

```
lib/booking/availability.ts   pure slot engine (16/16 unit tests)
lib/booking/schema.sql        Supabase tables (run in step 1)
lib/booking/db.ts             data layer (Supabase service-role)
lib/booking/google.ts         OAuth, free/busy, event+Meet, token refresh
lib/booking/slots.ts          bridges db + google + engine
lib/booking/link.ts           HMAC connect-token (tamper-proof)
lib/booking/admin.ts          owner-only guard
app/api/meet/availability     public: open slots for a type
app/api/meet/book             public: create booking (+re-validate, +Meet, +email)
app/api/meet/cancel           public: cancel via token
app/api/meet/google/connect   member: start Google OAuth (signed link)
app/api/meet/google/callback  member: finish OAuth
app/api/meet/admin/*          owner: members / types / availability / bookings CRUD
app/meet/[slug]               public booking page
app/meet/connected            "calendar linked" result
app/meet/cancel               cancel page
app/meet/admin                organizer console
```
