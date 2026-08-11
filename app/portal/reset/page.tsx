"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/ui/logo";
import { PasswordInput } from "@/components/ui/password-input";

export default function ResetPassword() {
  const [token, setToken] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "done">("idle");

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") || "");
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (pw.length < 4) { setErr("Password must be at least 4 characters."); return; }
    if (pw !== pw2) { setErr("The two passwords don't match."); return; }
    setStatus("busy");
    try {
      const r = await fetch("/api/portal/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new: pw }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.success) setStatus("done");
      else { setErr(d.error || "Reset failed."); setStatus("idle"); }
    } catch {
      setErr("Network error — try again."); setStatus("idle");
    }
  }

  const input = "w-full text-[14px] neu-inset text-foreground placeholder:text-faint rounded-[12px] px-3.5 py-3 outline-none focus:ring-2 focus:ring-gold/25 mb-4";
  const label = "block text-[12px] font-medium text-foreground/70 mb-1.5";

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
          {status === "done" ? (
            <div className="text-center py-2">
              <h1 className="font-serif text-[24px] font-[600] mb-2">Password updated</h1>
              <p className="text-[13px] text-muted-foreground mb-6">You can now sign in with your new password.</p>
              <Link href="/portal/login" className="inline-block btn-gold rounded-full px-6 py-2.5 font-[560] text-[14px]">Go to sign in</Link>
            </div>
          ) : token === "" ? (
            <div className="text-center py-2">
              <h1 className="font-serif text-[24px] font-[600] mb-2">Invalid link</h1>
              <p className="text-[13px] text-muted-foreground mb-6">This reset link is missing or invalid. Please request a new one from the sign-in page.</p>
              <Link href="/portal/login" className="text-[13px] font-semibold text-gold hover:underline underline-offset-2">Back to sign in</Link>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h1 className="font-serif text-[26px] font-[600] tracking-[-0.01em] mb-1.5">Set a new password</h1>
              <p className="text-[13px] text-muted-foreground mb-6">Choose a new password for your portal account.</p>

              <label className={label}>New password</label>
              <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" className={input} />

              <label className={label}>Confirm new password</label>
              <PasswordInput value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" className={input} />

              {err && <div className="text-[13px] text-[#b3341f] bg-[#fdeeea] border border-[#f3cfc6] rounded-xl px-3 py-2 mb-4">{err}</div>}

              <button type="submit" disabled={status === "busy" || token === null} className="w-full btn-gold rounded-full py-3 font-[560] text-[14px] disabled:opacity-60">
                {status === "busy" ? "Saving…" : "Save new password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
