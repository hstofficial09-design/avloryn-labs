"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogoMark } from "@/components/ui/logo";

type Code = { code: string; commission_pct: number; active: number; uses: number };
type Data = {
  employee: { id: string; name: string; emp_type: string; track: string | null; commission_pct: number };
  summary?: { orders: number; sales: number; earned: number; pending: number; paid: number; codes?: Code[] };
  orders: { id: string; product: string; code: string | null; doc_ref: string | null; order_amount_inr: number; commission_pct: number; commission_inr: number; status: string; created_at: string }[];
};

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const GHOST = "rounded-full bg-card ring-hairline hover:bg-muted text-foreground font-[520] transition-colors";
const GOLD = "btn-gold rounded-full font-[560]";

export default function EmployeeDashboard({ name, data, error }: { name: string; data: Data | null; error: string | null }) {
  const router = useRouter();
  async function logout() { await fetch("/api/portal/logout", { method: "POST" }); router.push("/portal/login"); }

  const s = data?.summary;
  const emp = data?.employee;
  const codes = data?.summary?.codes || [];
  const primaryCode = codes[0]?.code || data?.orders?.find((o) => o.code)?.code || null;
  const commissionPct = codes[0]?.commission_pct ?? emp?.commission_pct ?? 10;

  const [showPw, setShowPw] = useState(false);
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [nw2, setNw2] = useState("");
  const [pmsg, setPmsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pbusy, setPbusy] = useState(false);

  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    setPmsg(null);
    if (nw.length < 4) { setPmsg({ ok: false, t: "New password must be at least 4 characters." }); return; }
    if (nw !== nw2) { setPmsg({ ok: false, t: "The two new passwords don't match." }); return; }
    setPbusy(true);
    try {
      const r = await fetch("/api/portal/change-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current: cur, new: nw }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.success) { setPmsg({ ok: true, t: "Password updated." }); setCur(""); setNw(""); setNw2(""); }
      else setPmsg({ ok: false, t: d.error || "Could not change password." });
    } catch { setPmsg({ ok: false, t: "Network error — try again." }); }
    finally { setPbusy(false); }
  }
  const pwInput = "w-full text-[13px] neu-inset text-foreground placeholder:text-faint rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-gold/25 mb-2.5";

  return (
    <main className="portal-light min-h-screen font-sans px-4 sm:px-6 py-7">
      <div className="max-w-[880px] mx-auto">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <LogoMark size={30} />
            <div><div className="font-serif text-[17px] font-[600] leading-none">Avloryn <span className="text-gold">Labs</span></div><div className="section-label mt-1">Partner Portal</div></div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowPw((v) => !v)} className={GHOST + " text-[12.5px] px-3.5 py-1.5"}>Change password</button>
            <button onClick={logout} className={GHOST + " text-[12.5px] px-3.5 py-1.5"}>Sign out</button>
          </div>
        </header>

        {showPw && (
          <form onSubmit={changePw} className="mt-5 card-lux rounded-2xl p-5 max-w-md">
            <div className="font-serif text-[15px] font-[600] mb-3">Change your password</div>
            <input type="password" placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" className={pwInput} />
            <input type="password" placeholder="New password" value={nw} onChange={(e) => setNw(e.target.value)} autoComplete="new-password" className={pwInput} />
            <input type="password" placeholder="Confirm new password" value={nw2} onChange={(e) => setNw2(e.target.value)} autoComplete="new-password" className={pwInput} />
            {pmsg && <div className={"text-[12px] mb-2.5 " + (pmsg.ok ? "text-[#1e7a44]" : "text-[#b3341f]")}>{pmsg.t}</div>}
            <button type="submit" disabled={pbusy} className={GOLD + " text-[12.5px] px-4 py-2 disabled:opacity-60"}>{pbusy ? "Saving…" : "Update password"}</button>
          </form>
        )}

        <h1 className="font-serif text-[30px] font-[600] tracking-[-0.01em] mt-6 mb-1">Hi, {emp?.name || name} 👋</h1>
        <p className="text-[13.5px] text-muted-foreground mb-6">Commission from every sale made with your code — shown per product. Payouts go to your bank.</p>

        {error ? (
          <div className="rounded-xl border border-[#eeddb0] bg-[#fdf5e3] text-[#946412] text-[13px] px-4 py-3">⚠ {error}</div>
        ) : !emp ? (
          <div className="card-lux rounded-xl text-muted-foreground text-[13px] px-4 py-4">
            No commissions recorded yet. As soon as a sale is made with your code, it will appear here.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-6 card-lux rounded-2xl px-5 py-4 mb-5">
              <div>
                <div className="section-label">Your code{codes.length > 1 ? "s" : ""}</div>
                {primaryCode
                  ? <div className="font-mono text-[20px] font-extrabold text-gold mt-1">{codes.length ? codes.map((c) => c.code).join(", ") : primaryCode}</div>
                  : <div className="text-[13px] text-faint mt-1">Owner will share it soon</div>}
              </div>
              <div><div className="section-label">Your commission</div><div className="font-bold text-gold mt-1">{commissionPct}% of net sale</div></div>
              <div><div className="section-label">Role</div><div className="font-[560] mt-1">{emp.emp_type === "intern" ? `Intern${emp.track ? " · " + emp.track : ""}` : "Employee"}</div></div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <Stat k="Commission earned" v={inr(s?.earned || 0)} tone="#A9852F" />
              <Stat k="Sales generated" v={inr(s?.sales || 0)} />
              <Stat k="Pending payout" v={inr(s?.pending || 0)} tone="#946412" />
              <Stat k="Paid to you" v={inr(s?.paid || 0)} tone="#1e7a44" />
            </div>

            <div className="card-lux rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border"><b className="font-serif text-[15px] font-[600]">Your earnings</b></div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[620px]">
                  <thead><tr className="section-label bg-subtle/60">
                    <Th>Date</Th><Th>Product</Th><Th>Document</Th><Th r>Sale (net)</Th><Th r>Your %</Th><Th r>Commission</Th><Th>Status</Th>
                  </tr></thead>
                  <tbody>
                    {(!data || data.orders.length === 0) && <tr><td colSpan={7} className="text-center text-faint py-6">No earnings yet.</td></tr>}
                    {data?.orders.map((o) => (
                      <tr key={o.id} className="border-t border-border">
                        <td className="px-4 py-3">{(o.created_at || "").slice(0, 10)}</td>
                        <td className="px-4 py-3"><span className="inline-flex items-center gap-2 font-[560] text-[12.5px]"><span className="w-1.5 h-1.5 rounded-full bg-gold" />{o.product}</span></td>
                        <td className="px-4 py-3 font-mono text-[12px]">{o.doc_ref}</td>
                        <td className="px-4 py-3 text-right font-mono">{inr(o.order_amount_inr)}</td>
                        <td className="px-4 py-3 text-right font-mono">{o.commission_pct}%</td>
                        <td className="px-4 py-3 text-right font-mono">{inr(o.commission_inr)}</td>
                        <td className="px-4 py-3">{o.status === "paid" ? <span className="text-[#1e7a44] font-bold">Paid</span> : <span className="text-[#946412] font-bold">Pending</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-center text-[12px] text-faint mt-4">New Avloryn products will also show up here, tagged by product name. Payouts reach your bank once the owner pays.</p>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return <div className="card-lux rounded-xl px-4 py-3.5"><div className="text-[11.5px] text-muted-foreground mb-1.5">{k}</div><div className="text-[23px] font-extrabold font-mono tracking-tight" style={tone ? { color: tone } : {}}>{v}</div></div>;
}
function Th({ children, r }: { children: React.ReactNode; r?: boolean }) {
  return <th className={"px-4 py-2.5 " + (r ? "text-right" : "text-left")}>{children}</th>;
}
