"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LogoMark } from "@/components/ui/logo";

type Slot = { startISO: string; endISO: string; memberIds: string[] };
const DAY = 24 * 3600 * 1000;
const WINDOW_DAYS = 14;

export default function ReschedulePage() {
  const tz = useMemo(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } }, []);
  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<{ slug: string | null; name: string; currentStartISO: string; memberIds: string[]; clientName: string } | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [activeDate, setActiveDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [customTime, setCustomTime] = useState("");
  const [done, setDone] = useState<null | { startISO: string; meetLink: string | null }>(null);

  const fmtKey = useCallback((iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz }), [tz]);
  const fmtDate = useCallback((iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz }), [tz]);
  const fmtTime = useCallback((iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }), [tz]);

  useEffect(() => { setToken(new URLSearchParams(window.location.search).get("t")); }, []);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const r = await fetch(`/api/meet/reschedule?t=${encodeURIComponent(token)}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not load booking");
        setInfo(d);
      } catch (e) { setLoadErr(e instanceof Error ? e.message : "Could not load booking"); }
    })();
  }, [token]);

  const loadSlots = useCallback(async () => {
    if (!info?.slug) return;
    setLoadingSlots(true); setErr("");
    try {
      const r = await fetch("/api/meet/availability", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: info.slug, memberIds: info.memberIds, fromISO: new Date(Date.now() + 60000).toISOString(), toISO: new Date(Date.now() + WINDOW_DAYS * DAY).toISOString() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not load times");
      setSlots(Array.isArray(d.slots) ? d.slots : []);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not load times"); } finally { setLoadingSlots(false); }
  }, [info]);
  useEffect(() => { if (info?.slug) loadSlots(); }, [info, loadSlots]);

  const byDate = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots) { const k = fmtKey(s.startISO); (m.get(k) || m.set(k, []).get(k)!).push(s); }
    return m;
  }, [slots, fmtKey]);
  const dateKeys = useMemo(() => [...byDate.keys()].sort(), [byDate]);
  useEffect(() => { if (dateKeys.length && !activeDate) setActiveDate(dateKeys[0]); }, [dateKeys, activeDate]);

  async function rescheduleTo(startISO: string) {
    if (!token || !startISO) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/meet/reschedule", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, startISO }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "Could not reschedule");
      setDone({ startISO: d.startISO, meetLink: d.meetLink || null });
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not reschedule"); } finally { setBusy(false); }
  }
  const pick = (s: Slot) => rescheduleTo(s.startISO);

  const card = "card-lux rounded-3xl p-6 sm:p-7";
  const brand = (sub: string) => (
    <div className="flex items-center gap-3 mb-8 justify-center">
      <LogoMark size={32} />
      <div><div className="font-serif text-[18px] font-[600] leading-none">Avloryn <span className="text-gold">Labs</span></div><div className="section-label mt-1.5">{sub}</div></div>
    </div>
  );

  return (
    <main className="portal-light min-h-screen grid place-items-center px-5 py-12">
      <div className="w-full max-w-[620px]">
        {brand("Reschedule")}
        <div className={card}>
          {done ? (
            <div className="text-center">
              <div className="mx-auto mb-4 grid place-items-center w-14 h-14 rounded-full neu-chip text-gold text-[26px]">✓</div>
              <h1 className="font-serif text-[24px] font-[600] mb-1.5">Rescheduled</h1>
              <p className="text-[13.5px] text-muted-foreground mb-1">{new Date(done.startISO).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short", timeZone: tz })}</p>
              <p className="text-[12.5px] text-faint mb-5">An updated invite is on its way.</p>
              {done.meetLink && <a href={done.meetLink} target="_blank" rel="noopener noreferrer" className="btn-gold rounded-full px-6 py-3 font-[560] text-[14px] inline-block">Join with Google Meet</a>}
            </div>
          ) : loadErr ? (
            <p className="text-[13px] text-[#b3341f] text-center py-6">{loadErr}</p>
          ) : token === null ? (
            <p className="text-[13px] text-muted-foreground text-center py-6">Loading…</p>
          ) : !token ? (
            <p className="text-[13px] text-muted-foreground text-center py-6">This reschedule link looks invalid.</p>
          ) : !info ? (
            <p className="text-[13px] text-muted-foreground text-center py-6">Loading your booking…</p>
          ) : !info.slug ? (
            <>
              <div className="neu-chip rounded-2xl px-4 py-3 mb-5">
                <div className="text-[12px] text-faint">Currently</div>
                <div className="text-[13.5px] font-[560]">{info.name} — {new Date(info.currentStartISO).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: tz })}</div>
              </div>
              <label className="block text-[12px] font-medium text-foreground/70 mb-1.5">Pick a new date &amp; time</label>
              <input type="datetime-local" value={customTime} onChange={(e) => setCustomTime(e.target.value)} className="w-full text-[14px] neu-inset rounded-[12px] px-3.5 py-3 outline-none focus:ring-2 focus:ring-gold/25 mb-4" />
              {err && <div className="text-[13px] text-[#b3341f] bg-[#fdeeea] border border-[#f3cfc6] rounded-xl px-3 py-2 mb-4">{err}</div>}
              <button disabled={busy || !customTime} onClick={() => { const dt = new Date(customTime); if (!isNaN(dt.getTime())) rescheduleTo(dt.toISOString()); else setErr("Pick a valid date & time"); }} className="w-full btn-gold rounded-full py-3 font-[560] text-[14px] disabled:opacity-60">{busy ? "Please wait…" : "Reschedule"}</button>
              <p className="text-[11.5px] text-faint mt-4">Time in your timezone ({tz.replace(/_/g, " ")}).</p>
            </>
          ) : (
            <>
              <div className="neu-chip rounded-2xl px-4 py-3 mb-5">
                <div className="text-[12px] text-faint">Currently</div>
                <div className="text-[13.5px] font-[560]">{info.name} — {new Date(info.currentStartISO).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: tz })}</div>
              </div>
              <p className="text-[13px] text-muted-foreground mb-4">Pick a new time:</p>
              {loadingSlots ? (
                <div className="py-12 text-center text-[13px] text-muted-foreground">Loading times…</div>
              ) : dateKeys.length === 0 ? (
                <div className="py-12 text-center text-[13px] text-muted-foreground">No open times in the next {WINDOW_DAYS} days.</div>
              ) : (
                <>
                  <div className="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-1 px-1">
                    {dateKeys.map((k) => {
                      const on = k === activeDate;
                      return <button key={k} onClick={() => setActiveDate(k)} className={`shrink-0 rounded-2xl px-3.5 py-2 text-[12.5px] font-[560] whitespace-nowrap ${on ? "btn-gold" : "neu-chip text-foreground/80"}`}>{fmtDate(byDate.get(k)![0].startISO)}</button>;
                    })}
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[300px] overflow-y-auto pr-0.5">
                    {(activeDate ? byDate.get(activeDate) || [] : []).map((s) => (
                      <button key={s.startISO} disabled={busy} onClick={() => pick(s)} className="neu-inset rounded-lg py-2 text-[12.5px] font-[560] text-foreground/85 hover:text-gold hover:ring-2 hover:ring-gold/25 transition disabled:opacity-50">{fmtTime(s.startISO)}</button>
                    ))}
                  </div>
                </>
              )}
              {err && <div className="text-[13px] text-[#b3341f] bg-[#fdeeea] border border-[#f3cfc6] rounded-xl px-3 py-2 mt-4">{err}</div>}
              <p className="text-[11.5px] text-faint mt-4">Times in your timezone ({tz.replace(/_/g, " ")}).</p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
