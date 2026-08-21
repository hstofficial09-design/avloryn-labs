import { NextResponse } from "next/server";
import { runMonitor } from "@/lib/monitor/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Checking every calendar connection takes a moment; give it room rather than have it cut short
// and report a false failure.
export const maxDuration = 120;

/**
 * The scheduled watchdog run. Guarded by CRON_SECRET, the same way the reminders job is.
 *
 * Kept separate from the reminders job on purpose: if reminders start failing, the watchdog has to
 * still be alive to say so. One job that did both would go quiet at exactly the wrong moment.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  return req.headers.get("x-cron-secret") === secret || url.searchParams.get("key") === secret;
}

async function run() {
  const s = await runMonitor();
  return {
    ok: true,
    checked: s.checked,
    failing: s.failing,
    alerted: s.alerted,
    emailed: s.emailed,
    ...(s.emailError ? { emailError: s.emailError } : {}),
    // Enough to read the outcome straight from the run log without opening the portal.
    problems: s.results.filter((r) => r.ok !== true).map((r) => `${r.app}: ${r.title} — ${r.detail}`),
  };
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await run());
}
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await run());
}
