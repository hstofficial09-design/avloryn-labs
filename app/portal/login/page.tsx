"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogoMark } from "@/components/ui/logo";

export default function PortalLogin() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const input = "w-full text-[14px] neu-inset text-foreground placeholder:text-faint rounded-[12px] px-3.5 py-3 outline-none focus:ring-2 focus:ring-gold/25 mb-4";
  const label = "block text-[12px] font-medium text-foreground/70 mb-1.5";
  const cta = "w-full btn-gold rounded-full py-3 font-[560] text-[14px] disabled:opacity-60";
  const link = "mt-5 block w-full text-center text-[12.5px] font-semibold text-gold hover:underline underline-offset-2";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pw }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.success) router.push("/portal");
      else setErr(d.error || "Login failed");
    } catch {
      setErr("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await fetch("/api/portal/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch {
      setErr("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  function backToLogin() { setMode("login"); setSent(false); setErr(""); }

  return (
    <main className="portal-light min-h-screen flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-[404px]">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <LogoMark size={34} />
          <div>
            <div className="font-serif text-[19px] font-[600] leading-none">Avloryn <span className="text-gold">Labs</span></div>
            <div className="section-label mt-1.5">Partner Portal</div>
          </div>
        </div>

        <div className="card-lux rounded-3xl p-7 sm:p-8">
          {mode === "login" ? (
            <form onSubmit={submit}>
              <h1 className="font-serif text-[26px] font-[600] tracking-[-0.01em] mb-1.5">Sign in</h1>
              <p className="text-[13px] text-muted-foreground mb-6">Employees and owner — view your earnings and commissions.</p>

              <label className={label}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={input} />

              <label className={label}>Password</label>
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" className={input} />

              {err && <div className="text-[13px] text-[#b3341f] bg-[#fdeeea] border border-[#f3cfc6] rounded-xl px-3 py-2 mb-4">{err}</div>}

              <button type="submit" disabled={busy} className={cta}>{busy ? "Signing in…" : "Sign in"}</button>
              <button type="button" onClick={() => { setMode("forgot"); setErr(""); }} className={link}>Forgot password?</button>
            </form>
          ) : sent ? (
            <div className="text-center py-2">
              <h1 className="font-serif text-[24px] font-[600] mb-2">Check your email</h1>
              <p className="text-[13px] text-muted-foreground mb-6">If that email is registered, we&rsquo;ve sent a password-reset link (valid for 1 hour).</p>
              <button type="button" onClick={backToLogin} className="text-[13px] font-semibold text-gold hover:underline underline-offset-2">Back to sign in</button>
            </div>
          ) : (
            <form onSubmit={sendReset}>
              <h1 className="font-serif text-[26px] font-[600] tracking-[-0.01em] mb-1.5">Reset password</h1>
              <p className="text-[13px] text-muted-foreground mb-6">Enter your account email and we&rsquo;ll send you a reset link.</p>

              <label className={label}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={input} />

              {err && <div className="text-[13px] text-[#b3341f] bg-[#fdeeea] border border-[#f3cfc6] rounded-xl px-3 py-2 mb-4">{err}</div>}

              <button type="submit" disabled={busy} className={cta}>{busy ? "Sending…" : "Send reset link"}</button>
              <button type="button" onClick={backToLogin} className={link}>Back to sign in</button>
            </form>
          )}
        </div>
        <p className="text-center text-[12px] text-faint mt-5">Access issue? hardev@avloryn.com</p>
      </div>
    </main>
  );
}
