import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getOpeningBySlug } from "@/lib/portal-db";
import {
  validateAnswer, isCore, generalFields, DEFAULT_ACCEPT, DEFAULT_MAX_MB, TOTAL_UPLOAD_MB, type Field,
} from "@/lib/careers-fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Applications are deliberately NOT stored: they go straight to the careers inbox with the
// attachments. Nothing here writes to a database.
const TO = () => process.env.CAREERS_TO_EMAIL || "operations@avloryn.com";

// Per-instance limiter. Counting is split from checking on purpose: only a DELIVERED
// application counts, so someone who mistypes their email five times isn't locked out, and a
// shared office/college IP isn't burned by rejected attempts.
const sent = new Map<string, number[]>();
const WINDOW = 10 * 60_000;
const MAX_SENT = 8;
const recentFor = (ip: string) => (sent.get(ip) ?? []).filter((t) => Date.now() - t < WINDOW);
const tooMany = (ip: string) => recentFor(ip).length >= MAX_SENT;
const recordSent = (ip: string) => sent.set(ip, [...recentFor(ip), Date.now()]);

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Decoded byte length of base64 without allocating the buffer. */
const b64Bytes = (b: string) =>
  Math.floor((b.length * 3) / 4) - (b.endsWith("==") ? 2 : b.endsWith("=") ? 1 : 0);

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

  // Honeypot — bots fill hidden fields. Look successful, do nothing.
  if (String(body.company_website ?? "").trim()) return NextResponse.json({ ok: true });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (tooMany(ip)) {
    return NextResponse.json({ ok: false, error: "Too many applications from here. Please try again shortly." }, { status: 429 });
  }

  // Two shapes: an application to a listed role, or an open application to no role in particular.
  const general = body.general === true;
  const slug = String(body.slug ?? "").trim().slice(0, 80);
  const role = general ? null : slug ? await getOpeningBySlug(slug, true) : null;
  if (!general) {
    if (!role) return NextResponse.json({ ok: false, error: "That role is no longer accepting applications." }, { status: 404 });
    // Belt and braces: the role auto-closes on its own once the date passes, but a request that
    // lands in the same moment must not slip through. A stated deadline has to actually hold.
    const todayIST = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
    if (role.apply_by && role.apply_by < todayIST) {
      return NextResponse.json({ ok: false, error: "Applications for this role have closed." }, { status: 410 });
    }
  }
  const roleTitle = role ? role.title : "Open application";

  if (body.consent !== true) {
    return NextResponse.json({ ok: false, error: "Please agree to us processing your application." }, { status: 400 });
  }

  // ── Validate against THIS role's own form, never against whatever the client sent ──
  const fields: Field[] = role ? role.form_fields : generalFields();
  const rawAnswers = (body.answers && typeof body.answers === "object" ? body.answers : {}) as Record<string, unknown>;
  const rawFiles = (body.files && typeof body.files === "object" ? body.files : {}) as Record<string, { name?: string; b64?: string }>;

  const answers: { label: string; value: string }[] = [];
  const attachments: { filename: string; content: string }[] = [];
  let totalBytes = 0;
  let applicantName = "";
  let applicantEmail = "";

  for (const f of fields) {
    if (f.type === "file") {
      const up = rawFiles[f.id];
      const b64raw = String(up?.b64 ?? "");
      const b64 = b64raw.includes(",") ? b64raw.slice(b64raw.indexOf(",") + 1) : b64raw;
      if (!b64) {
        if (f.required) return NextResponse.json({ ok: false, error: `${f.label} is required.` }, { status: 400 });
        continue;
      }
      const name = String(up?.name ?? "file").trim().slice(0, 160).replace(/[\r\n"]/g, "");
      const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
      const accept = f.accept?.length ? f.accept : DEFAULT_ACCEPT;
      if (!accept.includes(ext)) {
        return NextResponse.json({ ok: false, error: `${f.label}: please attach ${accept.join(", ")}.` }, { status: 400 });
      }
      const bytes = b64Bytes(b64);
      if (bytes > (f.maxMb || DEFAULT_MAX_MB) * 1024 * 1024) {
        return NextResponse.json({ ok: false, error: `${f.label}: that file is over ${f.maxMb || DEFAULT_MAX_MB} MB.` }, { status: 400 });
      }
      totalBytes += bytes;
      if (totalBytes > TOTAL_UPLOAD_MB * 1024 * 1024) {
        return NextResponse.json({ ok: false, error: `The attachments together are over ${TOTAL_UPLOAD_MB} MB.` }, { status: 400 });
      }
      // Prefix so several uploads never collide in the inbox.
      attachments.push({ filename: `${f.id}-${name}`, content: b64 });
      answers.push({ label: f.label, value: name });
      continue;
    }

    // Validate the answer AS GIVEN. Truncating to f.max first made an over-long answer pass
    // silently — the candidate would never learn their text had been cut. The outer cap only
    // stops an unbounded string reaching us; it is always looser than any field limit, so it
    // can never turn a too-long answer into an accepted one.
    const value = String(rawAnswers[f.id] ?? "").trim().slice(0, 6000);
    const problem = validateAnswer(f, value);
    if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 400 });
    if (value) answers.push({ label: f.label, value });
    if (isCore(f.id) && f.id === "name") applicantName = value;
    if (isCore(f.id) && f.id === "email") applicantEmail = value;
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) return NextResponse.json({ ok: false, error: "Applications are not configured yet." }, { status: 503 });
  const from = process.env.CONTACT_FROM_EMAIL || "Avloryn Labs <onboarding@resend.dev>";
  const rz = new Resend(key);

  const who = applicantName || "A candidate";
  const rows = answers
    .map(
      (a) =>
        `<tr><td style="padding:7px 16px 7px 0;color:#6b6257;font-size:13px;vertical-align:top;white-space:nowrap">${esc(a.label)}</td>` +
        `<td style="padding:7px 0;color:#14110B;font-size:13px;white-space:pre-wrap">${esc(a.value)}</td></tr>`,
    )
    .join("");

  try {
    await rz.emails.send({
      from,
      to: TO(),
      ...(applicantEmail ? { replyTo: applicantEmail } : {}),
      subject: `${general ? "Open application" : "Application"}: ${roleTitle} — ${who}`,
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:660px">
        <p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#AB8B4C;margin:0 0 6px">Avloryn Labs · Careers</p>
        <h2 style="margin:0 0 4px;font-size:19px;color:#14110B">${esc(who)} — ${esc(roleTitle)}</h2>
        <p style="margin:0 0 16px;color:#6b6257;font-size:13px">${attachments.length ? `${attachments.length} file${attachments.length > 1 ? "s" : ""} attached.` : "No attachments."}</p>
        <table style="border-collapse:collapse">${rows}</table>
      </div>`,
      text:
        `${who} applied for ${roleTitle}\n\n` +
        answers.map((a) => `${a.label}: ${a.value}`).join("\n") +
        `\n\n${attachments.length} attachment(s).`,
      attachments,
    });
  } catch (e) {
    console.error("[careers] could not email the application:", e);
    return NextResponse.json({ ok: false, error: "We couldn't submit that — please try again in a moment." }, { status: 502 });
  }

  recordSent(ip);

  // Acknowledge to the candidate. Best-effort: their application is already delivered, so a
  // hiccup here must not tell them it failed.
  if (applicantEmail) {
    try {
      await rz.emails.send({
        from, to: applicantEmail,
        subject: `We've got your application — ${roleTitle}`,
        html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px">
          <p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#AB8B4C;margin:0 0 8px">Avloryn Labs</p>
          <p style="color:#14110B;font-size:14px;line-height:1.7">Hi ${esc((applicantName || "there").split(" ")[0])},</p>
          <p style="color:#14110B;font-size:14px;line-height:1.7">Thanks for applying for <strong>${esc(roleTitle)}</strong>. We've received everything you sent and will get back to you if there's a good fit.</p>
          <p style="color:#6b6257;font-size:13px;line-height:1.7">— Avloryn Labs</p></div>`,
        text: `Hi ${(applicantName || "there").split(" ")[0]},\n\nThanks for applying for ${roleTitle}. We've received everything you sent and will get back to you if there's a good fit.\n\n— Avloryn Labs`,
      });
    } catch { /* the application is in; the acknowledgement is a courtesy */ }
  }

  return NextResponse.json({ ok: true });
}
