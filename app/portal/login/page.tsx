"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PortalLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

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

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#FAF8F2] text-[#14110B] [color-scheme:light] px-5 font-sans">
      <div className="w-full max-w-[400px]">
        <div className="flex items-center gap-3 mb-7 justify-center">
          <div className="w-9 h-9 rounded-lg grid place-items-center text-[#3a2e0c] font-serif font-bold text-lg"
               style={{ background: "linear-gradient(150deg,#E7D6A6,#C6A249 55%,#A9852F)" }}>A</div>
          <div>
            <div className="font-serif text-lg font-bold leading-none">Avloryn <span className="text-[#A9852F]">Labs</span></div>
            <div className="text-[10px] tracking-[0.16em] uppercase text-[#948c79] mt-1">Partner Portal</div>
          </div>
        </div>

        <form onSubmit={submit} className="bg-white border border-[#E9E3D6] rounded-2xl p-7 shadow-[0_12px_40px_rgba(20,17,11,0.06)]">
          <h1 className="font-serif text-2xl font-bold mb-1">Sign in</h1>
          <p className="text-[13px] text-[#6b6455] mb-5">Employees and owner — sign in to view your earnings and commissions.</p>

          <label className="block text-[12px] font-medium text-[#3a352b] mb-1.5">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
            className="w-full text-[14px] bg-white text-[#14110B] border border-[#E2DBCB] rounded-[10px] px-3 py-2.5 outline-none focus:border-[#C6A249] focus:ring-2 focus:ring-[#C6A249]/20 mb-4" />

          <label className="block text-[12px] font-medium text-[#3a352b] mb-1.5">Password</label>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password"
            className="w-full text-[14px] bg-white text-[#14110B] border border-[#E2DBCB] rounded-[10px] px-3 py-2.5 outline-none focus:border-[#C6A249] focus:ring-2 focus:ring-[#C6A249]/20 mb-4" />

          {err && <div className="text-[13px] text-[#b3341f] bg-[#fdeeea] border border-[#f3cfc6] rounded-lg px-3 py-2 mb-4">{err}</div>}

          <button type="submit" disabled={busy}
            className="w-full rounded-[10px] py-3 font-bold text-[14px] text-[#3a2e0c] disabled:opacity-60"
            style={{ background: "linear-gradient(180deg,#E7D6A6,#C6A249 55%,#A9852F)" }}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="text-center text-[12px] text-[#948c79] mt-4">Access issue? hardev@avloryn.com</p>
      </div>
    </main>
  );
}
