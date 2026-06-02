import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const { email, company } = body as Record<string, string>;

  // Honeypot — silently accept, store nothing.
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

  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!cleanEmail || !EMAIL_RE.test(cleanEmail)) {
    return NextResponse.json({ ok: false, error: "Please enter a valid email." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error("[subscribe] Supabase env not configured");
    return NextResponse.json(
      { ok: false, error: "Subscriptions aren't available right now." },
      { status: 503 }
    );
  }

  // Dedupe: if this email already subscribed via the blog, succeed silently.
  const { data: existing } = await supabase
    .from("waitlist")
    .select("id")
    .eq("email", cleanEmail)
    .eq("source", "blog")
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true });
  }

  const { error: dbError } = await supabase.from("waitlist").insert({
    name: null,
    email: cleanEmail,
    intent: "newsletter",
    source: "blog",
  });

  if (dbError) {
    console.error("[subscribe] insert failed:", dbError.message);
    return NextResponse.json(
      { ok: false, error: "Could not subscribe you. Please try again." },
      { status: 500 }
    );
  }

  // Confirmation to the subscriber (best-effort). We do NOT email Hardev per
  // subscribe — he reads subscribers in Supabase.
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const from = process.env.CONTACT_FROM_EMAIL || "Avloryn Labs <onboarding@resend.dev>";
    try {
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from,
        to: cleanEmail,
        subject: "You're subscribed to Avloryn",
        text:
          "Thanks for subscribing to Avloryn.\n\n" +
          "You'll get the occasional note on building intelligent software — nothing more.\n\n" +
          "— Avloryn Labs",
      });
    } catch (e) {
      console.error("[subscribe] confirmation email failed:", e);
    }
  }

  return NextResponse.json({ ok: true });
}
