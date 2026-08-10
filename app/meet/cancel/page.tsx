"use client";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/ui/logo";

export default function CancelPage() {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t");
    setToken(t);
  }, []);

  async function cancel() {
    if (!token) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/meet/cancel", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not cancel");
      setState("done");
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : "Could not cancel");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="portal-light min-h-screen grid place-items-center px-5 py-12">
      <div className="w-full max-w-[420px]">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <LogoMark size={32} />
          <div>
            <div className="font-serif text-[18px] font-[600] leading-none">Avloryn <span className="text-gold">Labs</span></div>
            <div className="section-label mt-1.5">Cancel booking</div>
          </div>
        </div>
        <div className="card-lux rounded-3xl p-7 text-center">
          {state === "done" ? (
            <>
              <div className="mx-auto mb-4 grid place-items-center w-14 h-14 rounded-full neu-chip text-gold text-[24px]">✓</div>
              <h1 className="font-serif text-[24px] font-[600] mb-1.5">Booking cancelled</h1>
              <p className="text-[13px] text-muted-foreground">The meeting has been removed from the calendar. Thanks for letting us know.</p>
            </>
          ) : token === null ? (
            <p className="text-[13px] text-muted-foreground py-6">Loading…</p>
          ) : !token ? (
            <p className="text-[13px] text-muted-foreground py-6">This cancellation link looks invalid.</p>
          ) : (
            <>
              <h1 className="font-serif text-[24px] font-[600] mb-1.5">Cancel this meeting?</h1>
              <p className="text-[13px] text-muted-foreground mb-6">This will remove it from everyone&rsquo;s calendar. This can&rsquo;t be undone.</p>
              {msg && <div className="text-[13px] text-[#b3341f] bg-[#fdeeea] border border-[#f3cfc6] rounded-xl px-3 py-2 mb-4">{msg}</div>}
              <button onClick={cancel} disabled={busy} className="w-full btn-gold rounded-full py-3 font-[560] text-[14px] disabled:opacity-60">
                {busy ? "Cancelling…" : "Yes, cancel it"}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
