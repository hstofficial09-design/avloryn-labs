"use client";
import { useCallback, useEffect, useState } from "react";

/**
 * The banner that says something is broken.
 *
 * Alert emails get buried; the dashboard gets opened. So the same findings appear here, at the top
 * of the portal, and stay there until they are actually fixed — acknowledging one stops the email
 * reminders but deliberately does NOT hide it, because "we know about it" and "it is fixed" are
 * different things and only one of them should make the warning go away.
 *
 * This reads the LAST scheduled run rather than checking on load: opening the dashboard must not
 * go and poke every calendar. If that run is stale — which is the one failure a watchdog cannot
 * report about itself — the banner says so instead of implying all is well.
 */
type Check = {
  id: string; app: string; title: string; ok: boolean | null;
  severity: "critical" | "warn"; detail: string;
  brokenHours: number | null; acknowledged: boolean; ack_by: string | null;
  muted: boolean; muted_by: string | null;
};
type Data = {
  canAct: boolean; lastRun: string | null; stale: boolean; staleMin: number | null;
  counts: { total: number; critical: number; warn: number; acknowledged: number; ignored: number };
  failing: Check[];
  ignored: Check[];
};

const ago = (min: number | null) =>
  min === null ? "never" : min < 60 ? `${min} min ago` : min < 2880 ? `${Math.round(min / 60)}h ago` : `${Math.round(min / 1440)} days ago`;

const forHowLong = (h: number | null) =>
  h === null ? "just now" : h < 1 ? "under an hour" : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)} days`;

export default function SystemWatch() {
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState(false);

  // Owner only — the endpoint answers 403 to everyone else, and the panel then renders nothing at
  // all. Deliberately gated on the SERVER rather than by hiding the component: the findings name
  // people and are the company's business, not a colleague's.
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/portal/monitor", { cache: "no-store" });
      if (r.ok) setD(await r.json());
    } catch { /* a dashboard must still render when this cannot be reached */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(action: string, id?: string) {
    setBusy(id || action);
    try {
      await fetch("/api/portal/monitor", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      await load();
    } finally { setBusy(""); }
  }

  if (!d) return null;

  const live = d.failing.filter((c) => !c.acknowledged);
  const known = d.failing.filter((c) => c.acknowledged);
  const ignored = d.ignored || [];
  const worst = live.some((c) => c.severity === "critical");

  // Everything healthy and the watch itself is running: one quiet line. It is there to prove the
  // watchdog is alive — an all-clear that never changes is indistinguishable from a dead one.
  if (!d.failing.length && !ignored.length && !d.stale) {
    return (
      <div className="mb-5 flex items-center gap-2 text-[12px] text-faint">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#2e7d5b]" />
        All {d.counts.total} system checks passing · last checked {ago(d.staleMin)}
        {d.canAct && (
          <button onClick={() => act("run")} disabled={!!busy}
            className="ml-1 underline underline-offset-2 hover:text-foreground disabled:opacity-50">
            {busy === "run" ? "checking…" : "check now"}
          </button>
        )}
      </div>
    );
  }

  const tone = d.stale || worst
    ? { bg: "rgba(179,52,31,0.06)", ring: "rgba(179,52,31,0.35)", dot: "#b3341f", text: "#b3341f" }
    : { bg: "rgba(174,140,74,0.08)", ring: "rgba(174,140,74,0.35)", dot: "#AE8C4A", text: "#8a6d33" };

  return (
    <div className="mb-6 rounded-2xl p-4 sm:p-5" style={{ background: tone.bg, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}>
      <div className="flex items-start gap-3 flex-wrap">
        <span className="mt-1.5 inline-block w-2 h-2 rounded-full shrink-0" style={{ background: tone.dot }} />
        <div className="flex-1 min-w-[220px]">
          <div className="font-[620] text-[14px]" style={{ color: tone.text }}>
            {d.stale
              ? "The system watch has stopped running"
              : live.length
                ? `${live.length} thing${live.length === 1 ? "" : "s"} need${live.length === 1 ? "s" : ""} attention`
                : known.length
                  ? `${known.length} known issue${known.length === 1 ? "" : "s"} being dealt with`
                  : `${ignored.length} ignored issue${ignored.length === 1 ? "" : "s"}`}
          </div>
          <div className="text-[12.5px] text-faint mt-1">
            {d.stale
              ? `Nothing has been checked since ${ago(d.staleMin)} — until it runs again, nothing below is current.`
              : `Checked ${ago(d.staleMin)} · ${d.counts.total} checks across Avloryn and LivoDraft.`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(d.failing.length > 0 || ignored.length > 0) && (
            <button onClick={() => setOpen((v) => !v)}
              className="rounded-full ring-hairline bg-card hover:bg-muted px-3 py-1.5 text-[12px] font-[540]">
              {open ? "Hide" : "Details"}
            </button>
          )}
          {d.canAct && (
            <button onClick={() => act("run")} disabled={!!busy}
              className="rounded-full ring-hairline bg-card hover:bg-muted px-3 py-1.5 text-[12px] font-[540] disabled:opacity-50">
              {busy === "run" ? "Checking…" : "Check now"}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-2.5">
          {[...live, ...known].map((c) => (
            <div key={c.id} className="rounded-xl bg-card ring-hairline p-3">
              <div className="flex items-start gap-2 flex-wrap">
                <span className="neu-chip rounded-full px-2 py-0.5 text-[10.5px] font-[600] tracking-wide uppercase shrink-0">{c.app}</span>
                <div className="flex-1 min-w-[200px]">
                  <div className="text-[13px] font-[600] text-foreground">
                    {/* Titles are written as the thing that should be true ("Meeting reminders are
                        running"), so an unknown reads as a doubt about it rather than a broken
                        sentence. Never silently shown as a pass — not knowing is its own fault. */}
                    {c.ok === null ? <span className="font-[500] text-faint">Could not confirm — </span> : null}{c.title}
                  </div>
                  <div className="text-[12.5px] text-faint mt-0.5 break-words">{c.detail}</div>
                  <div className="text-[11.5px] mt-1.5" style={{ color: c.acknowledged ? undefined : tone.text }}>
                    {c.acknowledged
                      ? `Being dealt with${c.ack_by ? ` by ${c.ack_by}` : ""} — still broken after ${forHowLong(c.brokenHours)}`
                      : `Broken for ${forHowLong(c.brokenHours)}${c.severity === "warn" ? " · worth a look, nothing is being lost right now" : ""}`}
                  </div>
                </div>
                {d.canAct && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => act(c.acknowledged ? "unack" : "ack", c.id)} disabled={busy === c.id}
                      className="rounded-full ring-hairline bg-card hover:bg-muted px-2.5 py-1 text-[11.5px] font-[540] disabled:opacity-50">
                      {busy === c.id ? "…" : c.acknowledged ? "Not handled" : "I'm on it"}
                    </button>
                    {/* For a finding that is true but accepted — someone who genuinely does not
                        need a calendar. Sets it aside rather than deleting it. */}
                    <button onClick={() => act("mute", c.id)} disabled={busy === c.id}
                      title="Set this aside — it stops appearing here and stops emailing, and comes back if it changes or recovers"
                      className="rounded-full ring-hairline bg-card hover:bg-muted px-2.5 py-1 text-[11.5px] font-[540] text-faint disabled:opacity-50">
                      Ignore
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {d.canAct && live.length > 0 && (
            <div className="text-[11.5px] text-faint px-1">
              &ldquo;I&rsquo;m on it&rdquo; stops the reminder emails but keeps it listed until it actually passes.
              &ldquo;Ignore&rdquo; sets it aside entirely — it returns on its own if the finding changes or recovers.
            </div>
          )}

          {ignored.length > 0 && (
            <div className="pt-2 mt-1" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
              <div className="text-[11.5px] text-faint px-1 mb-2">
                Ignored ({ignored.length}) — still failing, deliberately set aside.
              </div>
              {ignored.map((c) => (
                <div key={c.id} className="flex items-start gap-2 px-1 py-1.5 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="text-[12px] text-faint">
                      <b className="font-[600]">{c.app}</b> · {c.title}
                      <span className="block break-words">{c.detail}</span>
                    </div>
                  </div>
                  {d.canAct && (
                    <button onClick={() => act("unmute", c.id)} disabled={busy === c.id}
                      className="rounded-full ring-hairline bg-card hover:bg-muted px-2.5 py-1 text-[11.5px] font-[540] shrink-0 disabled:opacity-50">
                      {busy === c.id ? "…" : "Un-ignore"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
