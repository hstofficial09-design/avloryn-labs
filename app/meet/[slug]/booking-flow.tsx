"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { LogoMark } from "@/components/ui/logo";

type MT = { name: string; slug: string; description: string; duration_min: number; mode: "any" | "all" };
type Member = { id: string; name: string };
type Slot = { startISO: string; endISO: string; memberIds: string[] };
type Question = { id: string; label: string; required: boolean };

const DAY = 24 * 3600 * 1000;
const WINDOW_STEP = 14;

export default function BookingFlow({ mt, members }: { mt: MT; members: Member[] }) {
  // Start as UTC so the server-rendered HTML and the first client render match
  // (the browser's real timezone is only known after mount → avoids a hydration mismatch).
  const [tz, setTz] = useState("UTC");
  useEffect(() => { try { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"); } catch { /* keep UTC */ } }, []);
  const embed = useMemo(() => { try { return new URLSearchParams(window.location.search).get("embed") === "1"; } catch { return false; } }, []);

  const [prefer, setPrefer] = useState<string>(""); // "any" mode: optional member filter
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [activeDate, setActiveDate] = useState<string>("");
  const [picked, setPicked] = useState<Slot | null>(null);
  const [windowDays, setWindowDays] = useState(WINDOW_STEP);
  const [maxAdvance, setMaxAdvance] = useState(60);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [durations, setDurations] = useState<number[]>([]);
  const [duration, setDuration] = useState(0);
  const [price, setPrice] = useState(0);
  const [coupon, setCoupon] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<null | { meetLink: string | null; startISO: string; endISO: string; cancelToken: string; pending?: boolean }>(null);

  const fmtDateKey = useCallback((iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz }), [tz]);
  const fmtDateLabel = useCallback(
    (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz }),
    [tz]
  );
  const fmtTime = useCallback(
    (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }),
    [tz]
  );

  const loadSlots = useCallback(async () => {
    setLoading(true); setLoadErr("");
    try {
      const fromISO = new Date(Date.now() + 60_000).toISOString();
      const toISO = new Date(Date.now() + windowDays * DAY).toISOString();
      const body: Record<string, unknown> = { slug: mt.slug, fromISO, toISO };
      if (mt.mode === "any" && prefer) body.memberIds = [prefer];
      if (duration) body.duration = duration;
      const r = await fetch("/api/meet/availability", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not load times");
      setSlots(Array.isArray(d.slots) ? d.slots : []);
      const m = d.meetingType || {};
      if (m.questions) setQuestions(m.questions);
      if (m.max_advance_days) setMaxAdvance(m.max_advance_days);
      if (typeof m.price_inr === "number") setPrice(m.price_inr);
      if (Array.isArray(m.durations)) { setDurations(m.durations); if (!duration && m.durations.length) setDuration(m.durations[0]); }
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Could not load times");
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [mt.slug, mt.mode, prefer, windowDays, duration]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  // Group slots by local date.
  const byDate = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const k = fmtDateKey(s.startISO);
      (map.get(k) || map.set(k, []).get(k)!).push(s);
    }
    return map;
  }, [slots, fmtDateKey]);

  const dateKeys = useMemo(() => [...byDate.keys()].sort(), [byDate]);
  useEffect(() => {
    if (dateKeys.length && (!activeDate || !byDate.has(activeDate))) setActiveDate(dateKeys[0]);
  }, [dateKeys, activeDate, byDate]);

  const daySlots = activeDate ? byDate.get(activeDate) || [] : [];

  function loadRazorpay(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as unknown as { Razorpay?: unknown }).Razorpay) return resolve();
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => resolve(); s.onerror = () => reject(new Error("Could not load the payment window"));
      document.body.appendChild(s);
    });
  }

  async function bookNow(payment?: Record<string, string>) {
    if (!picked) return;
    setBusy(true);
    try {
      const r = await fetch("/api/meet/book", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: mt.slug, startISO: picked.startISO, memberIds: picked.memberIds, name, email, notes, timezone: tz, answers, duration: duration || undefined, coupon: coupon || undefined, ...(payment || {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || "Could not confirm the booking");
      setDone({ pending: !!d.pending, meetLink: d.booking?.meetLink || null, startISO: d.booking?.startISO || picked.startISO, endISO: d.booking?.endISO || picked.endISO, cancelToken: d.booking?.cancelToken || "" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) return;
    for (const q of questions) if (q.required && !(answers[q.id] || "").trim()) { setErr(`Please answer: ${q.label}`); return; }
    setErr("");
    if (price <= 0) return bookNow();
    // Paid: create an order (amount computed server-side), then open Razorpay checkout.
    setBusy(true);
    try {
      const r = await fetch("/api/meet/pay/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: mt.slug, coupon: coupon || undefined }) });
      const o = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(o.error || "Payment could not start");
      if (o.free) { await bookNow(); return; }
      await loadRazorpay();
      const RZ = (window as unknown as { Razorpay: new (o: unknown) => { open: () => void } }).Razorpay;
      const rz = new RZ({
        key: o.keyId, amount: o.amount, currency: o.currency, order_id: o.orderId,
        name: "Avloryn Labs", description: mt.name, prefill: { name, email }, theme: { color: "#c8a24a" },
        handler: (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
          bookNow({ razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature }),
        modal: { ondismiss: () => setBusy(false) },
      });
      rz.open();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Payment error");
      setBusy(false);
    }
  }

  const card = "card-lux rounded-3xl p-6 sm:p-7";
  const input = "w-full text-[14px] neu-inset text-foreground placeholder:text-faint rounded-[12px] px-3.5 py-3 outline-none focus:ring-2 focus:ring-gold/25";
  const label = "block text-[12px] font-medium text-foreground/70 mb-1.5";

  // ── Pending approval ──
  if (done && done.pending) {
    const longWhen = new Date(done.startISO).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short", timeZone: tz });
    return (
      <div className={`max-w-[560px] mx-auto px-5 ${embed ? "py-6" : "py-14"}`}>
        {!embed && <Brand sub={mt.name} />}
        <div className={card + " text-center"}>
          <div className="mx-auto mb-4 grid place-items-center w-14 h-14 rounded-full neu-chip text-gold text-[24px]">⏳</div>
          <h1 className="font-serif text-[26px] font-[600] mb-1.5">Request received</h1>
          <p className="text-[13.5px] text-muted-foreground mb-1">{longWhen}</p>
          <p className="text-[12.5px] text-faint">We&rsquo;ll review and confirm by email to {email} shortly.</p>
        </div>
      </div>
    );
  }

  // ── Confirmation ──
  if (done) {
    const longWhen = new Date(done.startISO).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short", timeZone: tz });
    const basic = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const title = `${mt.name} — Avloryn Labs`;
    const details = done.meetLink ? `Join Google Meet: ${done.meetLink}` : "";
    const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${basic(done.startISO)}/${basic(done.endISO)}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(done.meetLink || "Online")}`;
    const outlook = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(title)}&startdt=${encodeURIComponent(done.startISO)}&enddt=${encodeURIComponent(done.endISO)}&body=${encodeURIComponent(details)}&location=${encodeURIComponent(done.meetLink || "Online")}&path=/calendar/action/compose&rru=addevent`;
    const ics = `data:text/calendar;charset=utf-8,${encodeURIComponent(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Avloryn Labs//EN\r\nBEGIN:VEVENT\r\nUID:${basic(done.startISO)}@avloryn.com\r\nDTSTAMP:${basic(new Date().toISOString())}\r\nDTSTART:${basic(done.startISO)}\r\nDTEND:${basic(done.endISO)}\r\nSUMMARY:${title}\r\nDESCRIPTION:${details}\r\nLOCATION:${done.meetLink || "Online"}\r\nEND:VEVENT\r\nEND:VCALENDAR`)}`;
    const calBtn = "neu-chip rounded-full px-3.5 py-2 text-[12px] font-[560] text-foreground/80 hover:text-gold";
    return (
      <div className={`max-w-[560px] mx-auto px-5 ${embed ? "py-6" : "py-14"}`}>
        {!embed && <Brand sub={mt.name} />}
        <div className={card + " text-center"}>
          <div className="mx-auto mb-4 grid place-items-center w-14 h-14 rounded-full neu-chip text-gold text-[26px]">✓</div>
          <h1 className="font-serif text-[26px] font-[600] mb-1.5">You&rsquo;re booked</h1>
          <p className="text-[13.5px] text-muted-foreground mb-1">{longWhen}</p>
          <p className="text-[12.5px] text-faint mb-5">A calendar invite is on its way to {email}.</p>
          <div className="flex items-center justify-center gap-2 flex-wrap mb-5">
            <a href={gcal} target="_blank" rel="noopener noreferrer" className={calBtn}>+ Google</a>
            <a href={outlook} target="_blank" rel="noopener noreferrer" className={calBtn}>+ Outlook</a>
            <a href={ics} download="invite.ics" className={calBtn}>+ Apple / .ics</a>
          </div>
          {done.meetLink && (
            <a href={done.meetLink} target="_blank" rel="noopener noreferrer" className="btn-gold rounded-full px-6 py-3 font-[560] text-[14px] inline-block">
              Join with Google Meet
            </a>
          )}
          {done.cancelToken && (
            <div className="mt-5 flex items-center justify-center gap-4">
              <a href={`/meet/reschedule?t=${done.cancelToken}`} className="text-[12.5px] font-semibold text-gold hover:underline underline-offset-2">Reschedule</a>
              <span className="text-faint">·</span>
              <a href={`/meet/cancel?t=${done.cancelToken}`} className="text-[12.5px] font-semibold text-gold hover:underline underline-offset-2">Cancel</a>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`max-w-[860px] mx-auto px-5 ${embed ? "py-6" : "py-12"}`}>
      {!embed && <Brand sub="Book a meeting" />}
      <div className="grid md:grid-cols-[300px_minmax(0,1fr)] gap-5">
        {/* Left: meeting details */}
        <div className={card + " h-fit"}>
          <div className="section-label mb-2">Meeting</div>
          <h1 className="font-serif text-[23px] font-[600] leading-tight mb-2">{mt.name}</h1>
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground mb-3">
            <span className="neu-chip rounded-full px-2.5 py-1 text-[12px]">{mt.duration_min} min</span>
            <span className="neu-chip rounded-full px-2.5 py-1 text-[12px]">{mt.mode === "all" ? "Group" : "1-on-1"}</span>
          </div>
          {mt.description && <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">{mt.description}</p>}

          {durations.length > 1 && (
            <div className="mb-3">
              <label className={label}>Duration</label>
              <div className="flex gap-2 flex-wrap">
                {durations.map((dm) => <button key={dm} onClick={() => { setDuration(dm); setPicked(null); }} className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-[560] ${duration === dm ? "btn-gold" : "neu-chip text-foreground/70"}`}>{dm} min</button>)}
              </div>
            </div>
          )}
          {price > 0 && <div className="mb-3 neu-chip rounded-xl px-3 py-2 text-[13px] font-[560] inline-block">₹{price}</div>}

          {mt.mode === "any" && members.length > 1 && (
            <div className="mt-2">
              <label className={label}>Prefer someone?</label>
              <select
                value={prefer}
                onChange={(e) => { setPrefer(e.target.value); setPicked(null); }}
                className={input}
              >
                <option value="">Anyone available</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}
          {mt.mode === "all" && (
            <p className="text-[12px] text-faint mt-2">With: {members.map((m) => m.name).join(", ") || "the team"}</p>
          )}
          <p className="text-[11.5px] text-faint mt-4">Times shown in your timezone ({tz.replace(/_/g, " ")}).</p>
        </div>

        {/* Right: dates + slots + form */}
        <div className={card + " min-w-0"}>
          {loading ? (
            <div className="py-16 text-center text-[13px] text-muted-foreground">Loading available times…</div>
          ) : loadErr ? (
            <div className="py-10 text-center">
              <p className="text-[13px] text-[#b3341f] mb-4">{loadErr}</p>
              <button onClick={loadSlots} className="btn-neu rounded-full px-5 py-2.5 text-[13px] font-semibold">Try again</button>
            </div>
          ) : dateKeys.length === 0 ? (
            <div className="py-16 text-center text-[13px] text-muted-foreground">
              No open times in the next {windowDays} days.<br />
              {windowDays < maxAdvance
                ? <button onClick={() => setWindowDays((w) => Math.min(maxAdvance, w + WINDOW_STEP))} className="text-gold font-semibold hover:underline">Look further ahead →</button>
                : "Please check back soon."}
            </div>
          ) : picked ? (
            // ── Details form ──
            <form onSubmit={confirm}>
              <button type="button" onClick={() => { setPicked(null); setErr(""); }} className="text-[12.5px] font-semibold text-gold mb-4 hover:underline underline-offset-2">← Back to times</button>
              <div className="neu-chip rounded-2xl px-4 py-3 mb-5">
                <div className="text-[13px] font-[560]">{fmtDateLabel(picked.startISO)}</div>
                <div className="text-[12.5px] text-muted-foreground">{fmtTime(picked.startISO)} – {fmtTime(picked.endISO)}</div>
              </div>
              <label className={label}>Your name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={input + " mb-4"} required />
              <label className={label}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input + " mb-4"} required autoComplete="email" />
              <label className={label}>Anything we should know? <span className="text-faint font-normal">(optional)</span></label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={input + " mb-4 resize-none"} />
              {questions.map((q) => (
                <div key={q.id}>
                  <label className={label}>{q.label}{q.required && <span className="text-gold"> *</span>}</label>
                  <input value={answers[q.id] || ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} className={input + " mb-4"} required={q.required} />
                </div>
              ))}
              {price > 0 && (
                <>
                  <label className={label}>Coupon code <span className="text-faint font-normal">(optional)</span></label>
                  <input value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} className={input + " mb-4"} placeholder="Have a code?" />
                </>
              )}
              {err && <div className="text-[13px] text-[#b3341f] bg-[#fdeeea] border border-[#f3cfc6] rounded-xl px-3 py-2 mb-4">{err}</div>}
              <button type="submit" disabled={busy} className="w-full btn-gold rounded-full py-3 font-[560] text-[14px] disabled:opacity-60">
                {busy ? "Please wait…" : price > 0 ? `Pay ₹${price} & confirm` : "Confirm booking"}
              </button>
            </form>
          ) : (
            <>
              {/* Date strip */}
              <div className="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-1 px-1">
                {dateKeys.map((k) => {
                  const first = byDate.get(k)![0].startISO;
                  const on = k === activeDate;
                  return (
                    <button
                      key={k}
                      onClick={() => setActiveDate(k)}
                      className={`shrink-0 rounded-2xl px-3.5 py-2 text-[12.5px] font-[560] whitespace-nowrap transition ${on ? "btn-gold" : "neu-chip text-foreground/80"}`}
                    >
                      {fmtDateLabel(first)}
                    </button>
                  );
                })}
              </div>
              {/* Time grid — compact + scrolls instead of growing the card */}
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[300px] overflow-y-auto pr-0.5">
                {daySlots.map((s) => (
                  <button
                    key={s.startISO}
                    onClick={() => { setPicked(s); setErr(""); }}
                    className="neu-inset rounded-lg py-2 text-[12.5px] font-[560] text-foreground/85 hover:text-gold hover:ring-2 hover:ring-gold/25 transition"
                  >
                    {fmtTime(s.startISO)}
                  </button>
                ))}
              </div>
              {windowDays < maxAdvance && (
                <div className="text-center mt-4">
                  <button onClick={() => setWindowDays((w) => Math.min(maxAdvance, w + WINDOW_STEP))} className="btn-neu rounded-full px-5 py-2 text-[12.5px] font-semibold">
                    Load more dates →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Brand({ sub }: { sub: string }) {
  return (
    <div className="flex items-center gap-3 mb-8 justify-center">
      <LogoMark size={32} />
      <div>
        <div className="font-serif text-[18px] font-[600] leading-none">Avloryn <span className="text-gold">Labs</span></div>
        <div className="section-label mt-1.5">{sub}</div>
      </div>
    </div>
  );
}
