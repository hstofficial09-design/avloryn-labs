import { NextResponse } from "next/server";
import { getSession } from "@/lib/portal-auth";
import { runBirthdayMail } from "@/lib/birthday-mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * The daily birthday mail.
 *
 * Guarded by CRON_SECRET like the other scheduled jobs. It runs hourly and decides for itself
 * whether to send: nothing before 09:00 India time, and nothing that has already gone out today —
 * every send is claimed in the database first, so running it again is harmless by design.
 *
 * The owner may also call it with a session, to PREVIEW. A preview builds the whole plan —
 * who would be wished, who would be told, and the exact words — and sends nothing, so the thing
 * can be checked on any ordinary day rather than only on somebody's birthday.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  return req.headers.get("x-cron-secret") === secret || url.searchParams.get("key") === secret;
}

async function handle(req: Request) {
  const url = new URL(req.url);
  const wantsPreview = url.searchParams.get("preview") === "1";

  // A preview is owner-only. Sending is cron-only. An owner session must never be able to trigger
  // a real send by adding a parameter — one stray click would mail the whole team.
  if (wantsPreview) {
    const s = await getSession();
    if (s?.role !== "owner" && !authorized(req)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    // ?date=YYYY-MM-DD answers "what will happen on the 8th" on any ordinary day. Safe to accept
    // because a preview never sends — the sending path below ignores it entirely.
    const on = url.searchParams.get("date") || "";
    const at = /^\d{4}-\d{2}-\d{2}$/.test(on) ? new Date(+on.slice(0, 4), +on.slice(5, 7) - 1, +on.slice(8, 10), 12) : undefined;
    const r = await runBirthdayMail({ preview: true, now: at });
    return NextResponse.json({
      ...r,
      plan: r.plan && {
        date: r.plan.date,
        celebrants: r.plan.celebrants.map((c) => ({ name: c.name, email: c.email })),
        audience: r.plan.audience.map((a) => a.email),
        greeting: { subject: r.plan.greeting.subject, text: r.plan.greeting.text(r.plan.celebrants[0]) },
        audienceCount: r.plan.audience.length,
        team: r.plan.team,
      },
    });
  }

  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await runBirthdayMail({ force: url.searchParams.get("force") === "1" }));
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
