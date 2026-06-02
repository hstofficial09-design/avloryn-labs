import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Naive in-memory rate limit (per server instance). Good enough as a first
// line of defence; a durable limiter can be added later if needed.
const hits = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { name, email, intent, message, company } = body as Record<string, string>;

  // Honeypot: bots fill hidden fields. Pretend success, store nothing.
  if (typeof company === "string" && company.trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again in a minute." },
      { status: 429 }
    );
  }

  // Server-side validation — never trust the client.
  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanEmail = typeof email === "string" ? email.trim() : "";
  const cleanMessage = typeof message === "string" ? message.trim() : "";
  const cleanIntent = typeof intent === "string" ? intent.trim().slice(0, 80) : "";

  if (!cleanName || !cleanEmail || !cleanMessage || !EMAIL_RE.test(cleanEmail)) {
    return NextResponse.json(
      { ok: false, error: "Please provide a name, a valid email, and a message." },
      { status: 400 }
    );
  }
  if (cleanName.length > 120 || cleanMessage.length > 4000) {
    return NextResponse.json({ ok: false, error: "Input is too long." }, { status: 400 });
  }

  // Store the lead.
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error("[contact] Supabase env not configured");
    return NextResponse.json(
      { ok: false, error: "The form isn't available right now. Please email us directly." },
      { status: 503 }
    );
  }

  const { error: dbError } = await supabase.from("waitlist").insert({
    name: cleanName,
    email: cleanEmail,
    intent: cleanIntent || null,
    message: cleanMessage,
    source: "avloryn.com",
  });

  if (dbError) {
    console.error("[contact] insert failed:", dbError.message);
    return NextResponse.json(
      { ok: false, error: "We couldn't save your message. Please try again." },
      { status: 500 }
    );
  }

  // Notify Hardev (best-effort — the lead is already saved, so a mail hiccup
  // shouldn't fail the user's submission).
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const from = process.env.CONTACT_FROM_EMAIL || "Avloryn Labs <onboarding@resend.dev>";
    const to = process.env.CONTACT_TO_EMAIL || "hardev@avloryn.com";
    try {
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from,
        to,
        replyTo: cleanEmail,
        subject: `New lead — ${cleanName}${cleanIntent ? ` (${cleanIntent})` : ""}`,
        text:
          `New submission from avloryn.com\n\n` +
          `Name: ${cleanName}\n` +
          `Email: ${cleanEmail}\n` +
          `Intent: ${cleanIntent || "—"}\n\n` +
          `Message:\n${cleanMessage}\n`,
      });
    } catch (e) {
      console.error("[contact] email send failed:", e);
    }
  } else {
    console.warn("[contact] RESEND_API_KEY missing — skipping notification email");
  }

  return NextResponse.json({ ok: true });
}
