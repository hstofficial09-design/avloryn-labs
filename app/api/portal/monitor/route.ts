import { NextResponse } from "next/server";
import { getSession } from "@/lib/portal-auth";
import { readState, readBeats, acknowledge, unacknowledge, BEAT_GRACE_MIN } from "@/lib/monitor/state";
import { runMonitor } from "@/lib/monitor/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * What the portal banner reads.
 *
 * GET is a plain read of the last scheduled run — opening the dashboard must never itself go and
 * poke every calendar, or the page would take half a minute and hammer Google on every visit.
 * "Check now" (POST action=run) is the deliberate, owner-only way to force a fresh run.
 */
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const [state, beats] = await Promise.all([readState().catch(() => []), readBeats().catch(() => [])]);
  const failing = state.filter((c) => c.ok !== true);
  const lastRun = beats.find((b) => b.name === "monitor")?.at || null;
  // A watchdog that has stopped running is the one failure it can never report itself, so the
  // banner is told how stale this data is and can say so out loud.
  const staleMin = lastRun ? Math.round((Date.now() - Date.parse(lastRun)) / 60000) : null;

  return NextResponse.json({
    // Everyone signed in sees that something is broken — the person who spots it first is often
    // not the owner. Only the owner can act on it (below).
    canAct: s.role === "owner",
    lastRun,
    stale: staleMin === null || staleMin > BEAT_GRACE_MIN.monitor,
    staleMin,
    counts: {
      total: state.length,
      critical: failing.filter((c) => c.severity === "critical" && !c.acknowledged).length,
      warn: failing.filter((c) => c.severity === "warn" && !c.acknowledged).length,
      acknowledged: failing.filter((c) => c.acknowledged).length,
    },
    failing,
    all: state,
  });
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  // Saying "I am on it" silences the reminders, and forcing a run costs real API calls — both are
  // the owner's to make, not anyone signed in.
  if (s.role !== "owner") return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const d = await req.json().catch(() => ({} as any));
  const action = String(d?.action || "");

  if (action === "run") {
    const r = await runMonitor();
    return NextResponse.json({ ok: true, checked: r.checked, failing: r.failing, emailed: r.emailed });
  }
  if (action === "ack" || action === "unack") {
    const id = String(d?.id || "").trim();
    if (!id) return NextResponse.json({ error: "Which check?" }, { status: 400 });
    if (action === "ack") await acknowledge(id, s.email || "owner");
    else await unacknowledge(id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
