"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Emp = {
  id: string; name: string; email: string | null; emp_type: string; track: string | null;
  commission_pct: number; source: string; active: number; has_password?: boolean;
  orders: number; sales: number; earned: number; pending: number; paid: number;
};
type Order = {
  id: string; employee_id: string; product: string; code: string | null; doc_ref: string | null;
  order_amount_inr: number; commission_pct: number; commission_inr: number; status: string; created_at: string;
};

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export default function OwnerDashboard({ employees, orders, error }:
  { employees: Emp[]; orders: Order[]; error: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ name: "", email: "", mobile: "", emp_type: "intern", track: "", commission_pct: "10", password: "" });

  const names: Record<string, string> = Object.fromEntries(employees.map((e) => [e.id, e.name]));
  const sales = employees.reduce((a, e) => a + e.sales, 0);
  const owed = employees.reduce((a, e) => a + e.pending, 0);
  const paidTot = employees.reduce((a, e) => a + e.paid, 0);

  async function markPaid(id: string, amt: number) {
    if (!confirm(`Mark ${inr(amt)} as paid for this employee? (Bank transfer already done)`)) return;
    setBusy(true);
    await fetch("/api/portal/mark-paid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employee_id: id }) });
    setBusy(false);
    router.refresh();
  }
  async function addEmp(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) { setMsg("Name, email and temp password required"); return; }
    setBusy(true); setMsg("");
    const r = await fetch("/api/portal/add-employee", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (d.success) { setShowAdd(false); setForm({ name: "", email: "", mobile: "", emp_type: "intern", track: "", commission_pct: "10", password: "" }); router.refresh(); }
    else setMsg(d.error || "Failed");
  }
  async function setLogin(id: string, name: string) {
    const pw = prompt(`Set a login password for ${name} — share it with them so they can sign in:`);
    if (pw === null) return;
    if (pw.length < 4) { alert("Password must be at least 4 characters"); return; }
    setBusy(true);
    const r = await fetch("/api/portal/set-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employee_id: id, password: pw }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (d.success) router.refresh(); else alert(d.error || "Failed");
  }
  async function logout() { await fetch("/api/portal/logout", { method: "POST" }); router.push("/portal/login"); }

  const inputCls = "w-full text-[13px] border border-[#E2DBCB] rounded-lg px-2.5 py-2 outline-none focus:border-[#C6A249]";

  return (
    <main className="min-h-screen bg-[#FAF8F2] text-[#14110B] font-sans px-4 sm:px-6 py-6">
      <div className="max-w-[980px] mx-auto">
        <Header role="Owner" onLogout={logout} />
        <h1 className="font-serif text-[30px] font-bold mt-5 mb-1">Commissions</h1>
        <p className="text-[13.5px] text-[#6b6455] mb-5">Saare employees, saare products — ek jagah. Bank se pay karke Mark Paid.</p>

        {error ? (
          <div className="rounded-xl border border-[#eeddb0] bg-[#fdf5e3] text-[#946412] text-[13px] px-4 py-3">
            ⚠ {error} — check that <code>LIVODRAFT_DATABASE_URL</code> is set.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <Stat k="Active employees" v={String(employees.filter((e) => e.active).length)} />
              <Stat k="Sales generated" v={inr(sales)} />
              <Stat k="Commission owed" v={inr(owed)} tone="#946412" />
              <Stat k="Paid out" v={inr(paidTot)} tone="#1e7a44" />
            </div>

            <div className="rounded-2xl border border-[#E9E3D6] bg-white overflow-hidden mb-5 shadow-[0_10px_30px_rgba(20,17,11,0.04)]">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#E9E3D6]">
                <b className="font-serif text-[15px]">Team &amp; commissions</b>
                <button onClick={() => setShowAdd((v) => !v)} className="text-[12.5px] font-bold text-[#3a2e0c] rounded-lg px-3 py-1.5"
                  style={{ background: "linear-gradient(180deg,#E7D6A6,#C6A249 55%,#A9852F)" }}>+ Add employee</button>
              </div>
              <div className="px-4 py-2.5 border-b border-[#E9E3D6] bg-[#fbfaf6] text-[12px] text-[#6b6455]">
                🪄 Onboarding form se log auto-aate hain (needs code+password setup). Manual add sirf backup ke liye.
              </div>
              {showAdd && (
                <form onSubmit={addEmp} className="px-4 py-3.5 border-b border-[#E9E3D6] bg-[#FBF5E7]">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <input className={inputCls} placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    <input className={inputCls} placeholder="Email (login)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    <input className={inputCls} placeholder="Mobile" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
                    <select className={inputCls} value={form.emp_type} onChange={(e) => setForm({ ...form, emp_type: e.target.value })}>
                      <option value="intern">Intern</option><option value="employee">Employee</option>
                    </select>
                    <input className={inputCls} placeholder="Track (M&C / P&R)" value={form.track} onChange={(e) => setForm({ ...form, track: e.target.value })} />
                    <input className={inputCls} type="number" placeholder="Commission %" value={form.commission_pct} onChange={(e) => setForm({ ...form, commission_pct: e.target.value })} />
                    <input className={inputCls + " sm:col-span-2"} placeholder="Temp password (share with employee)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                  </div>
                  <div className="mt-2.5 flex items-center gap-3">
                    <button disabled={busy} type="submit" className="text-[12.5px] font-bold text-[#3a2e0c] rounded-lg px-4 py-2" style={{ background: "linear-gradient(180deg,#E7D6A6,#C6A249 55%,#A9852F)" }}>Create employee</button>
                    {msg && <span className="text-[12px] text-[#b3341f]">{msg}</span>}
                  </div>
                </form>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[680px]">
                  <thead><tr className="text-[11px] uppercase tracking-wide text-[#948c79] bg-[#fdfbf5]">
                    <Th>Employee</Th><Th>Product</Th><Th r>Orders</Th><Th r>Sales</Th><Th r>Earned</Th><Th r>Pending</Th><Th>Payout</Th>
                  </tr></thead>
                  <tbody>
                    {employees.length === 0 && <tr><td colSpan={7} className="text-center text-[#948c79] py-5">No employees yet — add one, or they arrive from the onboarding form.</td></tr>}
                    {employees.map((e) => (
                      <tr key={e.id} className="border-t border-[#E9E3D6]">
                        <td className="px-4 py-3">
                          <b>{e.name}</b>
                          <div className="text-[10.5px] font-bold text-[#A9852F]">{e.emp_type === "intern" ? `Intern${e.track ? " · " + e.track : ""}` : "Employee"}</div>
                          {!e.has_password
                            ? <button disabled={busy} onClick={() => setLogin(e.id, e.name)} className="mt-1 text-[10.5px] font-semibold text-[#A9852F] underline underline-offset-2">Set login password →</button>
                            : <div className="text-[10px] text-[#948c79] mt-0.5">✓ can log in</div>}
                        </td>
                        <td className="px-4 py-3"><span className="inline-flex items-center gap-2 font-bold text-[12.5px]"><span className="w-2 h-2 rounded-full" style={{ background: "linear-gradient(150deg,#C6A249,#A9852F)" }} />LivoDraft · {e.commission_pct}%</span></td>
                        <td className="px-4 py-3 text-right font-mono">{e.orders}</td>
                        <td className="px-4 py-3 text-right font-mono">{inr(e.sales)}</td>
                        <td className="px-4 py-3 text-right font-mono">{inr(e.earned)}</td>
                        <td className="px-4 py-3 text-right font-mono">{inr(e.pending)}</td>
                        <td className="px-4 py-3">
                          {e.pending > 0
                            ? <button disabled={busy} onClick={() => markPaid(e.id, e.pending)} className="text-[12px] font-bold text-[#3a2e0c] rounded-md px-3 py-1.5" style={{ background: "linear-gradient(180deg,#E7D6A6,#C6A249 55%,#A9852F)" }}>Mark {inr(e.pending)} Paid</button>
                            : <span className="text-[12px] text-[#948c79]">{e.orders > 0 ? "Settled ✓" : "—"}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-[#E9E3D6] bg-white overflow-hidden shadow-[0_10px_30px_rgba(20,17,11,0.04)]">
              <div className="px-4 py-3 border-b border-[#E9E3D6] flex items-center justify-between">
                <b className="font-serif text-[15px]">Commission orders</b><span className="text-[11.5px] text-[#948c79]">every paid order using an employee code</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[720px]">
                  <thead><tr className="text-[11px] uppercase tracking-wide text-[#948c79] bg-[#fdfbf5]">
                    <Th>Date</Th><Th>Employee</Th><Th>Product</Th><Th>Code</Th><Th>Doc Ref</Th><Th r>Sale (net)</Th><Th r>%</Th><Th r>Commission</Th><Th>Status</Th>
                  </tr></thead>
                  <tbody>
                    {orders.length === 0 && <tr><td colSpan={9} className="text-center text-[#948c79] py-5">No commission orders yet.</td></tr>}
                    {orders.map((o) => (
                      <tr key={o.id} className="border-t border-[#E9E3D6]">
                        <td className="px-4 py-3">{(o.created_at || "").slice(0, 10)}</td>
                        <td className="px-4 py-3">{names[o.employee_id] || o.employee_id}</td>
                        <td className="px-4 py-3">{o.product}</td>
                        <td className="px-4 py-3 font-mono text-[12px] text-[#A9852F]">{o.code}</td>
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
          </>
        )}
      </div>
    </main>
  );
}

function Header({ role, onLogout }: { role: string; onLogout: () => void }) {
  return (
    <header className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg grid place-items-center text-[#3a2e0c] font-serif font-bold" style={{ background: "linear-gradient(150deg,#E7D6A6,#C6A249 55%,#A9852F)" }}>A</div>
        <div><div className="font-serif text-[17px] font-bold leading-none">Avloryn <span className="text-[#A9852F]">Labs</span></div><div className="text-[10px] tracking-[0.14em] uppercase text-[#948c79] mt-0.5">Partner Portal</div></div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-bold uppercase tracking-wide text-[#7a5f1c] bg-[#E7D6A6] border border-[#C6A249] px-2.5 py-1 rounded-full">{role}</span>
        <button onClick={onLogout} className="text-[12.5px] font-semibold text-[#3a352b] border border-[#E2DBCB] rounded-lg px-3 py-1.5 bg-white">Sign out</button>
      </div>
    </header>
  );
}
function Stat({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return <div className="rounded-xl border border-[#E9E3D6] bg-white px-4 py-3.5"><div className="text-[11.5px] text-[#6b6455] mb-1.5">{k}</div><div className="text-[24px] font-extrabold font-mono tracking-tight" style={tone ? { color: tone } : {}}>{v}</div></div>;
}
function Th({ children, r }: { children: React.ReactNode; r?: boolean }) {
  return <th className={"font-bold px-4 py-2.5 " + (r ? "text-right" : "text-left")}>{children}</th>;
}
