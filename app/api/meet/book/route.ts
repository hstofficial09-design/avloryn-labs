import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { Resend } from "resend";
import { getMeetingTypeBySlug, listMembers, createBooking, upcomingCountByMember, incrementCouponUse, membersWithZoho, type IntakeAnswer } from "@/lib/booking/db";
import { memberBusy, createMeetingForMembers } from "@/lib/booking/google";
import { createZohoForMembers, getZohoBusy } from "@/lib/booking/zoho";
import { quote, verifySignature } from "@/lib/booking/pay";
import { buildICS } from "@/lib/booking/ics";
import { meetingInviteHTML, whenIST } from "@/lib/booking/email";
import { SITE_URL } from "@/lib/seo";
import { threadHeaders, guestSubject, teamSubject } from "@/lib/booking/thread";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY = 24 * 3600 * 1000;

export async function POST(req: Request) {
  const d = await req.json().catch(() => ({}));
  const mt = await getMeetingTypeBySlug(String(d.slug || ""));
  if (!mt || !mt.active) return NextResponse.json({ error: "Unknown meeting type" }, { status: 404 });

  const name = String(d.name || "").trim();
  const email = String(d.email || "").trim();
  const notes = String(d.notes || "").trim();
  const clientTz = String(d.timezone || "").trim() || null;
  const startMs = Date.parse(String(d.startISO || ""));
  if (!name || !EMAIL_RE.test(email)) return NextResponse.json({ error: "Name and a valid email are required" }, { status: 400 });
  if (Number.isNaN(startMs)) return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
  if (startMs < Date.now()) return NextResponse.json({ error: "That time is in the past" }, { status: 400 });
  if (startMs > Date.now() + (mt.max_advance_days ?? 60) * DAY) return NextResponse.json({ error: "That date is too far ahead." }, { status: 400 });

  // Duration: honour the client's pick only if the type offers it, else the default.
  const allowedDurations = (mt.durations && mt.durations.length) ? mt.durations : [mt.duration_min];
  const reqDur = Math.round(Number(d.duration) || 0);
  const durationMin = allowedDurations.includes(reqDur) ? reqDur : mt.duration_min;

  // Custom intake questions → validate required + collect answers.
  const raw = (d.answers && typeof d.answers === "object") ? d.answers as Record<string, string> : {};
  const answers: IntakeAnswer[] = [];
  for (const q of mt.questions ?? []) {
    const a = String(raw[q.id] ?? "").trim();
    if (q.required && !a) return NextResponse.json({ error: `Please answer: ${q.label}` }, { status: 400 });
    if (a) answers.push({ q: q.label, a });
  }

  const endMs = startMs + durationMin * 60_000;
  const startISO = new Date(startMs).toISOString();
  const endISO = new Date(endMs).toISOString();

  // Who attends. "all" → the whole pool. "any" → round-robin (least-loaded) among the free
  // candidates the client's slot offered (or the whole pool if none were passed).
  const chosen = Array.isArray(d.memberIds) ? d.memberIds.map(String).filter((id: string) => mt.member_ids.includes(id)) : [];
  let memberIds: string[];
  if (mt.mode === "all") {
    memberIds = mt.member_ids.slice();
  } else {
    const pool: string[] = chosen.length ? chosen : mt.member_ids.slice();
    const counts = await upcomingCountByMember(pool);
    const pick = pool.slice().sort((a, b) => (counts[a] || 0) - (counts[b] || 0))[0];
    memberIds = pick ? [pick] : [];
  }
  // Same id twice would write that person's calendar twice (host + "other member").
  memberIds = Array.from(new Set(memberIds));
  if (!memberIds.length) return NextResponse.json({ error: "Please choose who you'd like to meet" }, { status: 400 });
  // Prefer the chosen organizer as host (Meet creator) when they're attending.
  if (mt.organizer_id && memberIds.includes(mt.organizer_id)) {
    memberIds = [mt.organizer_id, ...memberIds.filter((id) => id !== mt.organizer_id)];
  }

  // ── Re-validate against LIVE free/busy so two people can't grab the same slot. ──
  const bufB = mt.buffer_before_min * 60_000, bufA = mt.buffer_after_min * 60_000;
  const ps = startMs - bufB, pe = endMs + bufA;
  try {
    const winFrom = new Date(ps).toISOString(), winTo = new Date(pe).toISOString();
    for (const id of memberIds) {
      // Check BOTH Google and Zoho — an event on either calendar means the member is busy.
      const [gb, zb] = await Promise.all([memberBusy(id, winFrom, winTo), getZohoBusy(id, winFrom, winTo).catch(() => [])]);
      const busy = [...gb, ...zb];
      if (busy.some((b) => Date.parse(b.start) < pe && ps < Date.parse(b.end))) {
        return NextResponse.json({ error: "Sorry, that slot was just taken. Please pick another." }, { status: 409 });
      }
    }
  } catch {
    /* if free/busy can't be read we still let the booking through — the calendar invite is source of truth */
  }

  const members = await listMembers();
  const byId = new Map(members.map((m) => [m.id, m]));
  const memberEmails = memberIds.map((id) => byId.get(id)?.email).filter(Boolean) as string[];
  const memberNames = memberIds.map((id) => byId.get(id)?.name).filter(Boolean).join(", ");
  const answerLines = answers.map((a) => `${a.q}: ${a.a}`).join("\n");
  const baseDesc = `${mt.name} with ${name} (${email}).${notes ? `\n\nNotes: ${notes}` : ""}${answerLines ? `\n\n${answerLines}` : ""}`;
  const from = process.env.CONTACT_FROM_EMAIL || "Avloryn Labs <onboarding@resend.dev>";
  const key = process.env.RESEND_API_KEY;
  const whenClient = new Date(startMs).toLocaleString("en-IN", { timeZone: clientTz || "Asia/Kolkata", dateStyle: "full", timeStyle: "short" });

  // ── Payment (paid meeting types) ──
  let paymentId: string | null = null, amountInr: number | null = null, couponCode: string | null = null;
  if ((mt.price_inr || 0) > 0) {
    const q = await quote(mt.price_inr!, d.coupon);
    amountInr = q.amount; couponCode = q.couponValid ? q.couponCode : null;
    if (q.amount > 0) {
      const okSig = verifySignature(String(d.razorpay_order_id || ""), String(d.razorpay_payment_id || ""), String(d.razorpay_signature || ""));
      if (!okSig) return NextResponse.json({ error: "Payment could not be verified" }, { status: 402 });
      paymentId = String(d.razorpay_payment_id);
    }
    if (couponCode) { try { await incrementCouponUse(couponCode); } catch { /* ignore */ } }
  }

  // ── Manual approval (free types): save as pending, no calendar yet. ──
  if (mt.requires_approval && (mt.price_inr || 0) === 0) {
    const cancelToken = randomBytes(18).toString("hex");
    const booking = await createBooking({
      meeting_type_id: mt.id, member_ids: memberIds,
      client_name: name, client_email: email, client_notes: notes, client_timezone: clientTz,
      start_utc: startISO, end_utc: endISO, google_event_id: null, meet_link: null, cancel_token: cancelToken,
      answers,
    }, "pending");
    try {
      if (key && EMAIL_RE.test(email)) {
        await new Resend(key).emails.send({ from, to: email, subject: guestSubject(mt.name),
          headers: threadHeaders(booking.id),
          text: `Hi ${name},\n\nWe've received your request for ${mt.name} on ${whenClient}. We'll confirm shortly by email.\n\n— Avloryn Labs` });
      }
      const to = Array.from(new Set([...memberEmails, process.env.CONTACT_TO_EMAIL].filter(Boolean))) as string[];
      if (key && to.length) await new Resend(key).emails.send({ from, to, subject: teamSubject(mt.name, name),
        headers: threadHeaders(booking.id),
        text: `A booking is awaiting approval.\n\nClient: ${name} (${email})\nWhen: ${whenClient}\nWith: ${memberNames}\n\nApprove it in Scheduling → Bookings.` });
    } catch { /* best-effort */ }
    return NextResponse.json({ ok: true, pending: true, booking: { id: booking.id, startISO, endISO, cancelToken } });
  }

  // Write the meeting to EVERY attending member's own calendar (guaranteed auto-add) and
  // invite the client. The Meet link comes from the host (first connected) member's event.
  // One copy per person, on the calendar they actually use: Zoho where connected, Google
  // otherwise. Google still hosts the Meet link and the guest invite.
  const zohoIds = await membersWithZoho(memberIds);
  const hostOrder = [...memberIds.filter((id) => !zohoIds.has(id)), ...memberIds.filter((id) => zohoIds.has(id))];
  const googleCopyMemberIds = memberIds.filter((id) => !zohoIds.has(id));

  let meetLink: string | null = null;
  let eventsJson: string | null = null;
  let onGoogle: string[] = [];
  try {
    const { meetLink: ml, events } = await createMeetingForMembers({
      memberIds: hostOrder, googleCopyMemberIds, memberEmails, clientEmail: email,
      summary: `${mt.name} — ${name}`, description: baseDesc, startISO, endISO,
    });
    meetLink = ml;
    if (events.length) eventsJson = JSON.stringify(events);
    // Only the people whose meeting was actually WRITTEN to a Google calendar. Anyone else — which
    // now means anyone who lives in Zoho — still gets their Zoho copy.
    //
    // This briefly counted attendees too, on the theory that an invitation lands on their calendar
    // anyway. For a Zoho user it does not: their working calendar is Zoho, the invitation goes to a
    // Google account they do not open, and the meeting simply stopped appearing for them.
    // Only people who got a Google copy AND do not work in Zoho. Someone with Zoho connected has
    // their diary there; the Google entry is how the Meet is hosted, not where they read their day.
    onGoogle = events.map((e) => e.memberId).filter((id) => !zohoIds.has(id));
  } catch (e) {
    /* calendar write failed — still save the booking so the request isn't lost */
    console.error("[meet/book] Google calendar failed:", e);
  }

  // Mirror onto Zoho only for members Google did NOT cover — anyone with both connected would
  // otherwise get the same meeting twice.
  let zohoJson: string | null = null;
  try {
    const zevents = await createZohoForMembers({ memberIds, summary: `${mt.name} — ${name}`, description: baseDesc, startISO, endISO, meetLink, alreadyOnGoogle: onGoogle });
    if (zevents.length) zohoJson = JSON.stringify(zevents);
  } catch (e) { console.error("[meet/book] Zoho calendar failed:", e); }

  const cancelToken = randomBytes(18).toString("hex");
  const booking = await createBooking({
    meeting_type_id: mt.id, member_ids: memberIds,
    client_name: name, client_email: email, client_notes: notes, client_timezone: clientTz,
    start_utc: startISO, end_utc: endISO, google_event_id: eventsJson, meet_link: meetLink, cancel_token: cancelToken,
    answers, zoho_event_id: zohoJson, payment_id: paymentId, amount_inr: amountInr, coupon_code: couponCode,
  });

  // The invitation, built once so BOTH emails can carry it. It used to be built inside the
  // client's block, which is why the team's message could not attach it — they were sent a notice
  // about a meeting rather than an invitation to one, with nothing to accept.
  const inviteIcs = buildICS({
    uid: booking.id, startISO, endISO,
    summary: `${mt.name} — Avloryn Labs`,
    description: (meetLink ? `Join Google Meet: ${meetLink}\n\n` : "") + `${mt.name} with ${memberNames || "Avloryn Labs"}.`,
    location: meetLink || "Online",
    organizerName: "Avloryn Labs", organizerEmail: memberEmails[0] || undefined,
    attendeeEmails: [email, ...memberEmails].filter(Boolean),
  });

  // Branded confirmation to the client (+ a universal .ics attachment).
  try {
    if (key && EMAIL_RE.test(email)) {
      const cancelUrl = `${SITE_URL}/meet/cancel?t=${cancelToken}`;
      const rescheduleUrl = `${SITE_URL}/meet/reschedule?t=${cancelToken}`;
      const ics = buildICS({
        uid: booking.id, startISO, endISO,
        summary: `${mt.name} — Avloryn Labs`,
        description: (meetLink ? `Join Google Meet: ${meetLink}\n\n` : "") + `${mt.name} with ${memberNames || "Avloryn Labs"}.`,
        location: meetLink || "Online",
        organizerName: "Avloryn Labs", organizerEmail: memberEmails[0] || undefined,
        attendeeEmails: [email, ...memberEmails],
      });
      await new Resend(key).emails.send({
        from, to: email,
        subject: guestSubject(mt.name),
        headers: threadHeaders(booking.id),
        html: meetingInviteHTML({ heading: "You're booked", title: mt.name, whenText: whenClient, withNames: memberNames || "Avloryn Labs", greetingName: name.split(" ")[0] || undefined, notes, meetLink, rescheduleUrl, cancelUrl }),
        text:
          `Hi ${name},\n\nYour ${mt.name} is confirmed.\n\n` +
          `When: ${whenClient}\nWith: ${memberNames || "Avloryn Labs"}\n` +
          (meetLink ? `Join (Google Meet): ${meetLink}\n` : "") +
          `\nThe attached invite adds this to your calendar (works with any calendar app).\n\n` +
          `Reschedule: ${rescheduleUrl}\nCancel: ${cancelUrl}\n\n— Avloryn Labs`,
        attachments: [{ filename: "invite.ics", content: Buffer.from(ics).toString("base64") }],
      });
    }
  } catch { /* email best-effort */ }

  // Team notification: let the attending members (+ ops inbox) know a booking came in.
  try {
    const to = Array.from(new Set([...memberEmails, process.env.CONTACT_TO_EMAIL].filter(Boolean))) as string[];
    if (key && to.length) {
      await new Resend(key).emails.send({
        from, to,
        // The same invitation the client gets, so this can be accepted and adds itself to
        // whichever calendar they use.
        attachments: [{ filename: "invite.ics", content: Buffer.from(inviteIcs).toString("base64") }],
        subject: teamSubject(mt.name, name),
        headers: threadHeaders(booking.id),
        html: meetingInviteHTML({ heading: "New booking", title: `${mt.name} — ${name}`, whenText: whenIST(startISO), withNames: memberNames || "—", notes: [`Client: ${name} (${email})`, notes, answerLines].filter(Boolean).join(" · "), meetLink }),
        text:
          `New ${mt.name} booked.\n\n` +
          `Client: ${name} (${email})\nWhen: ${whenClient}\nWith: ${memberNames}\n` +
          (meetLink ? `Meet: ${meetLink}\n` : "") +
          (notes ? `\nNotes: ${notes}\n` : "") +
          (answerLines ? `\n${answerLines}\n` : ""),
      });
    }
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, booking: { id: booking.id, startISO, endISO, meetLink, cancelToken } });
}
