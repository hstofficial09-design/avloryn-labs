"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogoMark } from "@/components/ui/logo";
import { roleLabel } from "@/lib/role-label";

type Code = { code: string; commission_pct: number; active: number; uses: number };
type Emp = {
  id: string; name: string; email: string | null; mobile: string | null; emp_type: string; track: string | null;
  commission_pct: number; source: string; active: number; has_password?: boolean;
  dob?: string | null; address?: string | null; id_type?: string | null; id_number?: string | null;
  custom_answers?: string | null;
  is_student?: string | null; college?: string | null; student_id?: string | null;
  start_date?: string | null; duration?: string | null; codes?: Code[];
  orders: number; sales: number; earned: number; pending: number; paid: number;
  /** Network partners only. `role` is their kind (Campus Ambassador, Influencer…), `upline` is
   *  whose network they sit in, and partner_approved is 0 while they await the owner's approval. */
  role?: string | null; upline?: string | null; partner_approved?: number | null;
};
type Order = {
  id: string; employee_id: string; product: string; code: string | null; doc_ref: string | null;
  order_amount_inr: number; commission_pct: number; commission_inr: number; status: string; created_at: string;
};
type Deleted = { id: string; name: string; email: string | null; emp_type: string; track: string | null; deleted_at: string };

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const GOLD = "btn-gold rounded-full font-[560]";
const GHOST = "rounded-full bg-card ring-hairline hover:bg-muted text-foreground font-[520] transition-colors";
// Format a date for display. Accepts ISO ("2026-08-11") OR an already-formatted string
// ("08 Aug 2026") — NEVER slice (that truncated "2026" → "202").
const dt = (s?: string | null) => {
  if (!s) return "—";
  const d = new Date(String(s));
  return isNaN(d.getTime()) ? String(s) : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
function purgeDate(iso: string) {
  const d = new Date(iso); d.setFullYear(d.getFullYear() + 1);
  return isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

/** Answers to the owner's custom onboarding questions, stored as a JSON array of {q,a}. */
function parseAnswers(raw?: string | null): { q: string; a: string }[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => x && x.q && x.a) : [];
  } catch { return []; }
}

export default function OwnerDashboard({ employees, orders, deleted, names, trackMap, gmv, error }:
  { employees: Emp[]; orders: Order[]; deleted: Deleted[]; names: Record<string, string>; trackMap: Record<string, boolean>; gmv?: number; error: string | null }) {
  const router = useRouter();
  const isComm = (track: string | null) => (track ? trackMap[track] !== false : true);
  // Network partners are not staff — they are outside recruiters (campus ambassadors, influencers,
  // agencies) on a different deal: their own 10%, plus 2% to whoever brought them in. They have no
  // track, so the commission split above swept them in with the team and they read as employees.
  // They get their own table, with the one column that only matters for them: whose network.
  const partners = employees.filter((e) => e.emp_type === "partner");
  const staff = employees.filter((e) => e.emp_type !== "partner");
  const commEmps = staff.filter((e) => isComm(e.track));
  const nonCommEmps = staff.filter((e) => !isComm(e.track));
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [detail, setDetail] = useState<Emp | null>(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ name: "", email: "", mobile: "", emp_type: "intern", track: "", commission_pct: "10", password: "" });
  // The kinds the owner set up in /portal/onboarding. Read here so this form and the public one
  // stay the same list rather than drifting into two hard-coded copies.
  const [regTypes, setRegTypes] = useState<{ key: string; label: string }[]>([]);
  useEffect(() => {
    fetch("/api/onboarding-form/config").then((r) => r.json())
      .then((d) => { if (Array.isArray(d.regTypes) && d.regTypes.length) setRegTypes(d.regTypes); })
      .catch(() => { /* the form still works on the built-in default */ });
  }, []);

  // True company GMV (each sale once). Computed server-side (companyGmv) because a 2-tier sale
  // books two commission rows — network partner 10% + BD 2% override — so summing per-employee sales would
  // double-count. Fall back to the raw sum only if gmv wasn't provided.
  const sales = typeof gmv === "number" ? gmv : employees.reduce((a, e) => a + e.sales, 0);
  const owed = employees.reduce((a, e) => a + e.pending, 0);
  const paidTot = employees.reduce((a, e) => a + e.paid, 0);

  async function post(url: string, body: any) {
    setBusy(true);
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    return { ok: r.ok, d };
  }
  async function markPaid(id: string, amt: number) {
    if (!confirm(`Mark ${inr(amt)} as paid for this employee? (Bank transfer already done)`)) return;
    await post("/api/portal/mark-paid", { employee_id: id }); router.refresh();
  }
  async function setLogin(id: string, name: string) {
    const pw = prompt(`Set a login password for ${name} — share it with them so they can sign in:`);
    if (pw === null) return;
    if (pw.length < 4) { alert("Password must be at least 4 characters"); return; }
    const { ok, d } = await post("/api/portal/set-password", { employee_id: id, password: pw });
    if (ok && d.success) router.refresh(); else alert(d.error || "Failed");
  }
  async function addEmp(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) { setMsg("Name, email and temp password required"); return; }
    setMsg("");
    const { ok, d } = await post("/api/portal/add-employee", form);
    if (ok && d.success) { setShowAdd(false); setForm({ name: "", email: "", mobile: "", emp_type: "intern", track: "", commission_pct: "10", password: "" }); router.refresh(); }
    else setMsg(d.error || "Failed");
  }
  async function deleteEmp(id: string, name: string) {
    if (!confirm(`Delete ${name}?\n\nThe record + commission history are kept for 1 year, then removed automatically. You can restore before then.`)) return;
    const { ok } = await post("/api/portal/delete-employee", { employee_id: id });
    if (ok) { setDetail(null); router.refresh(); }
  }
  async function restoreEmp(id: string) {
    const { ok } = await post("/api/portal/restore-employee", { employee_id: id });
    if (ok) router.refresh();
  }
  async function logout() { await fetch("/api/portal/logout", { method: "POST" }); router.push("/portal/login"); }

  const inputCls = "w-full text-[13px] neu-inset text-foreground placeholder:text-faint rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-gold/25";

  function codeCell(e: Emp) {
    if (e.codes && e.codes.length) {
      return <div className="space-y-0.5">{e.codes.map((c) => (
        <div key={c.code} className="text-[12.5px]"><span className="font-mono font-bold text-gold">{c.code}</span> · {c.commission_pct}% <span className="text-[10px] text-faint">({c.uses} used)</span></div>
      ))}</div>;
    }
    return <span className="text-[12px] text-faint">No code yet · {e.commission_pct}% default</span>;
  }

  return (
    <main className="portal-light min-h-screen font-sans px-4 sm:px-6 py-7">
      <div className="max-w-[1000px] mx-auto">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <LogoMark size={30} />
            <div><div className="font-serif text-[17px] font-[600] leading-none">Avloryn <span className="text-gold">Labs</span></div><div className="section-label mt-1">Partner Portal</div></div>
          </div>
          <div className="flex items-center gap-3">
            <a href="/portal" className={GHOST + " text-[12.5px] px-3.5 py-1.5"}>← Home</a>
            <span className="section-label !text-gold bg-gold-soft/60 ring-hairline px-2.5 py-1 rounded-full">Owner</span>
            <button onClick={logout} className={GHOST + " text-[12.5px] px-3.5 py-1.5"}>Sign out</button>
          </div>
        </header>

        <h1 className="font-serif text-[30px] font-[600] tracking-[-0.01em] mt-6 mb-1">Commissions</h1>
        <p className="text-[13.5px] text-muted-foreground mb-6">All employees, all products — in one place. Click a name for full details. Pay by bank transfer, then Mark Paid.</p>

        {error ? (
          <div className="rounded-xl border border-[#eeddb0] bg-[#fdf5e3] text-[#946412] text-[13px] px-4 py-3">
            ⚠ {error} — check that <code>LIVODRAFT_DATABASE_URL</code> is set.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              {/* Staff and network partners counted apart — a partner is not on the payroll, and
                  one number covering both answers neither "how big is the team" nor "how big is
                  the network". */}
              <Stat k="Active employees" v={String(staff.filter((e) => e.active).length)}
                    sub={partners.length ? `+ ${partners.length} network partner${partners.length === 1 ? "" : "s"}` : undefined} />
              <Stat k="Sales generated" v={inr(sales)} />
              <Stat k="Commission owed" v={inr(owed)} tone="#946412" />
              <Stat k="Paid out" v={inr(paidTot)} tone="#1e7a44" />
            </div>

            <div className="card-lux rounded-2xl overflow-hidden mb-5">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                <b className="font-serif text-[15px] font-[600]">Team &amp; commissions</b>
                <button onClick={() => setShowAdd((v) => !v)} className={GOLD + " text-[12.5px] px-3.5 py-1.5"}>{showAdd ? "Close" : "+ Add employee"}</button>
              </div>
              <div className="px-5 py-2.5 border-b border-border bg-subtle/50 text-[12px] text-muted-foreground">
                🪄 People arrive automatically from the onboarding form (you still set their code and login password). Manual add is only a backup.
              </div>
              {showAdd && (
                <form onSubmit={addEmp} className="px-5 py-4 border-b border-border bg-subtle/40">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[12.5px] font-[560] text-foreground">Add an employee manually</span>
                    <button type="button" onClick={() => { setShowAdd(false); setMsg(""); }} className="grid h-6 w-6 place-items-center rounded-full bg-card ring-hairline text-muted-foreground hover:text-foreground" aria-label="Close">✕</button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <input className={inputCls} placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    <input className={inputCls} placeholder="Email (login)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    <input className={inputCls} placeholder="Mobile" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
                    {/* Same list the onboarding form offers, so adding someone by hand and someone
                        joining through the form can never produce two different kinds of person. */}
                    <select className={inputCls} value={form.emp_type} onChange={(e) => setForm({ ...form, emp_type: e.target.value })}>
                      {(regTypes.length ? regTypes : [{ key: "intern", label: "Intern" }]).map((t) => (
                        <option key={t.key} value={t.key}>{t.label}</option>
                      ))}
                    </select>
                    <input className={inputCls} placeholder="Track (M&C / P&R)" value={form.track} onChange={(e) => setForm({ ...form, track: e.target.value })} />
                    <input className={inputCls} type="number" placeholder="Commission %" value={form.commission_pct} onChange={(e) => setForm({ ...form, commission_pct: e.target.value })} />
                    <input className={inputCls + " sm:col-span-2"} placeholder="Temp password (share with employee)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <button disabled={busy} type="submit" className={GOLD + " text-[12.5px] px-4 py-2"}>Create employee</button>
                    <button type="button" onClick={() => { setShowAdd(false); setMsg(""); }} className="text-[12.5px] font-[520] text-muted-foreground">Cancel</button>
                    {msg && <span className="text-[12px] text-[#b3341f]">{msg}</span>}
                  </div>
                </form>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[720px]">
                  <thead><tr className="section-label bg-subtle/60">
                    <Th>Employee</Th><Th>Code / Commission</Th><Th r>Orders</Th><Th r>Sales</Th><Th r>Earned</Th><Th r>Pending</Th><Th>Payout</Th>
                  </tr></thead>
                  <tbody>
                    {commEmps.length === 0 && <tr><td colSpan={7} className="text-center text-faint py-6">No commission-based employees yet.</td></tr>}
                    {commEmps.map((e) => (
                      <tr key={e.id} className="border-t border-border">
                        <td className="px-4 py-3">
                          <button onClick={() => setDetail(e)} className="font-[600] text-left text-foreground hover:text-gold transition-colors">{e.name}</button>
                          <div className="text-[10.5px] font-bold text-gold">{roleLabel(e)}</div>
                          {!e.has_password
                            ? <button disabled={busy} onClick={() => setLogin(e.id, e.name)} className="mt-1 text-[10.5px] font-semibold text-gold underline underline-offset-2">Set login password →</button>
                            : <div className="text-[10px] text-faint mt-0.5">✓ can log in</div>}
                        </td>
                        <td className="px-4 py-3">{codeCell(e)}</td>
                        <td className="px-4 py-3 text-right font-mono">{e.orders}</td>
                        <td className="px-4 py-3 text-right font-mono">{inr(e.sales)}</td>
                        <td className="px-4 py-3 text-right font-mono">{inr(e.earned)}</td>
                        <td className="px-4 py-3 text-right font-mono">{inr(e.pending)}</td>
                        <td className="px-4 py-3">
                          {e.pending > 0
                            ? <button disabled={busy} onClick={() => markPaid(e.id, e.pending)} className={GOLD + " text-[12px] px-3 py-1.5"}>Mark {inr(e.pending)} Paid</button>
                            : <span className="text-[12px] text-faint">{e.orders > 0 ? "Settled ✓" : "—"}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card-lux rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <b className="font-serif text-[15px] font-[600]">Network partners</b>{" "}
                  <span className="text-[11.5px] text-faint">campus ambassadors, influencers and agencies — not staff</span>
                </div>
                <a href="/portal/network" className="text-[11.5px] font-[560] text-gold underline underline-offset-2">Open the network →</a>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[780px]">
                  <thead><tr className="section-label bg-subtle/60">
                    <Th>Partner</Th><Th>In whose network</Th><Th>Code / Commission</Th><Th r>Orders</Th><Th r>Sales</Th><Th r>Earned</Th><Th r>Pending</Th><Th>Payout</Th>
                  </tr></thead>
                  <tbody>
                    {partners.length === 0 && (
                      <tr><td colSpan={8} className="text-center text-faint py-6">
                        No network partners yet — anyone on the team can add one from <a href="/portal/network" className="text-gold underline underline-offset-2">their network</a>.
                      </td></tr>
                    )}
                    {partners.map((e) => (
                      <tr key={e.id} className="border-t border-border">
                        <td className="px-4 py-3">
                          <button onClick={() => setDetail(e)} className="font-[600] text-left text-foreground hover:text-gold transition-colors">{e.name}</button>
                          <div className="text-[10.5px] font-bold text-gold">{e.role || "Network Partner"}</div>
                          {/* A partner approved but never given a password is earning and locked out —
                              they see nothing and assume nothing has sold. */}
                          {e.partner_approved === 0
                            ? <div className="text-[10.5px] font-semibold text-[#b3341f] mt-0.5">Waiting for your approval</div>
                            : !e.has_password
                              ? <button disabled={busy} onClick={() => setLogin(e.id, e.name)} className="mt-1 text-[10.5px] font-semibold text-gold underline underline-offset-2">Set login password →</button>
                              : <div className="text-[10px] text-faint mt-0.5">✓ can log in</div>}
                        </td>
                        <td className="px-4 py-3">
                          {e.upline
                            ? <><span className="text-foreground">{e.upline}</span><div className="text-[10.5px] text-faint">earns 2% override</div></>
                            : <><span className="text-faint">Direct — yours</span><div className="text-[10.5px] text-faint">no override paid</div></>}
                        </td>
                        <td className="px-4 py-3">{codeCell(e)}</td>
                        <td className="px-4 py-3 text-right font-mono">{e.orders}</td>
                        <td className="px-4 py-3 text-right font-mono">{inr(e.sales)}</td>
                        <td className="px-4 py-3 text-right font-mono">{inr(e.earned)}</td>
                        <td className="px-4 py-3 text-right font-mono">{inr(e.pending)}</td>
                        <td className="px-4 py-3">
                          {e.pending > 0
                            ? <button disabled={busy} onClick={() => markPaid(e.id, e.pending)} className={GOLD + " text-[12px] px-3 py-1.5"}>Mark {inr(e.pending)} Paid</button>
                            : <span className="text-[12px] text-faint">{e.orders > 0 ? "Settled ✓" : "—"}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {nonCommEmps.length > 0 && (
              <div className="card-lux rounded-2xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-border"><b className="font-serif text-[15px] font-[600]">Team (no commission)</b> <span className="text-[11.5px] text-faint">roles without the commission model (e.g. HR)</span></div>
                <div className="overflow-x-auto"><table className="w-full text-[13px] min-w-[520px]">
                  <thead><tr className="section-label bg-subtle/60"><Th>Employee</Th><Th>Role</Th><Th>Login</Th></tr></thead>
                  <tbody>
                    {nonCommEmps.map((e) => (
                      <tr key={e.id} className="border-t border-border">
                        <td className="px-4 py-3"><button onClick={() => setDetail(e)} className="font-[600] text-left text-foreground hover:text-gold transition-colors">{e.name}</button></td>
                        <td className="px-4 py-3">{roleLabel(e)}</td>
                        <td className="px-4 py-3">{!e.has_password ? <button disabled={busy} onClick={() => setLogin(e.id, e.name)} className="text-[11px] font-semibold text-gold underline underline-offset-2">Set password →</button> : <span className="text-[11px] text-faint">✓ can log in</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            )}

            <RolesCard />

            <div className="card-lux rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                <b className="font-serif text-[15px] font-[600]">Commission orders</b><span className="text-[11.5px] text-faint">every paid order using an employee code</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[720px]">
                  <thead><tr className="section-label bg-subtle/60">
                    <Th>Date</Th><Th>Employee</Th><Th>Product</Th><Th>Code</Th><Th>Doc Ref</Th><Th r>Sale (net)</Th><Th r>%</Th><Th r>Commission</Th><Th>Status</Th>
                  </tr></thead>
                  <tbody>
                    {orders.length === 0 && <tr><td colSpan={9} className="text-center text-faint py-6">No commission orders yet.</td></tr>}
                    {orders.map((o) => (
                      <tr key={o.id} className="border-t border-border">
                        <td className="px-4 py-3">{dt(o.created_at)}</td>
                        <td className="px-4 py-3">{names[o.employee_id] || o.employee_id}</td>
                        <td className="px-4 py-3">{o.product}</td>
                        <td className="px-4 py-3 font-mono text-[12px] text-gold">{o.code}</td>
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

            {deleted.length > 0 && (
              <div className="mt-5">
                <button onClick={() => setShowDeleted((v) => !v)} className="text-[12.5px] font-semibold text-muted-foreground underline underline-offset-2">
                  {showDeleted ? "Hide" : "Show"} deleted employees ({deleted.length}) — kept 1 year
                </button>
                {showDeleted && (
                  <div className="mt-3 card-lux rounded-2xl overflow-hidden">
                    <table className="w-full text-[13px] min-w-[560px]">
                      <thead><tr className="section-label bg-subtle/60"><Th>Employee</Th><Th>Deleted on</Th><Th>Auto-removed on</Th><Th>Action</Th></tr></thead>
                      <tbody>
                        {deleted.map((d) => (
                          <tr key={d.id} className="border-t border-border">
                            <td className="px-4 py-3"><b>{d.name}</b><div className="text-[10.5px] text-faint">{d.email}</div></td>
                            <td className="px-4 py-3">{dt(d.deleted_at)}</td>
                            <td className="px-4 py-3">{purgeDate(d.deleted_at)}</td>
                            <td className="px-4 py-3"><button disabled={busy} onClick={() => restoreEmp(d.id)} className="text-[12px] font-semibold text-gold underline underline-offset-2">Restore</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {detail && <DetailModal e={detail} onClose={() => setDetail(null)} onDelete={() => deleteEmp(detail.id, detail.name)} onSetLogin={() => setLogin(detail.id, detail.name)} busy={busy} codeCell={codeCell} />}
    </main>
  );
}

function DetailModal({ e, onClose, onDelete, onSetLogin, busy, codeCell }:
  { e: Emp; onClose: () => void; onDelete: () => void; onSetLogin: () => void; busy: boolean; codeCell: (e: Emp) => React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#14110B]/45 p-4 py-10 backdrop-blur-[2px]" onClick={onClose}>
      <div className="w-full max-w-[560px] rounded-3xl bg-card text-foreground shadow-[0_30px_80px_-20px_rgba(20,17,11,0.5)] ring-1 ring-border" onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
          <div>
            <div className="font-serif text-[21px] font-[600] leading-tight">{e.name}</div>
            <div className="text-[11.5px] font-bold text-gold mt-0.5">{roleLabel(e)}{e.source ? ` · from ${e.source}` : ""}</div>
          </div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-full bg-card ring-hairline text-muted-foreground hover:text-foreground" aria-label="Close">✕</button>
        </div>

        <div className="px-6 py-5">
          <div className="mb-5 rounded-2xl px-4 py-3.5 bg-gold-soft/40 ring-1 ring-[hsl(var(--gold)/0.25)]">
            <div className="section-label mb-1.5">Code &amp; commission</div>
            {codeCell(e)}
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <MiniStat k="Earned" v={inr(e.earned)} /><MiniStat k="Pending" v={inr(e.pending)} tone="#946412" /><MiniStat k="Paid" v={inr(e.paid)} tone="#1e7a44" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3 text-[13px]">
            <Row k="Email" v={e.email} /><Row k="Mobile" v={e.mobile} />
            <Row k="Date of birth" v={dt(e.dob)} /><Row k="Login" v={e.has_password ? "Active ✓" : "Not set"} />
            <Row k="Address" v={e.address} full />
            <Row k="ID type" v={e.id_type} /><Row k="ID number" v={e.id_number} />
            <Row k="Current student" v={e.is_student} /><Row k="College" v={e.college} />
            <Row k="Student ID" v={e.student_id} /><Row k="Start date" v={dt(e.start_date)} />
            <Row k="Duration" v={e.duration} />
            {parseAnswers(e.custom_answers).map((a) => <Row key={a.q} k={a.q} v={a.a} full />)}
          </div>

          <p className="mt-5 text-[11.5px] text-faint">📎 Photo &amp; ID document are in the onboarding email sent to the owner.</p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
          {!e.has_password
            ? <button disabled={busy} onClick={onSetLogin} className="btn-gold rounded-full text-[12.5px] font-[560] px-4 py-2">Set login password</button>
            : <span className="text-[12px] text-faint">✓ Can log in</span>}
          <button disabled={busy} onClick={onDelete} className="text-[12.5px] font-semibold text-[#b3341f] ring-1 ring-[#f3cfc6] rounded-full px-4 py-2 hover:bg-[#fdeeea] transition-colors">Delete employee</button>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, full }: { k: string; v?: string | null; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <div className="section-label">{k}</div>
      <div className="font-[520] mt-0.5">{v && String(v).trim() ? v : "—"}</div>
    </div>
  );
}
function MiniStat({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div><div className="font-mono font-extrabold text-[15px]" style={tone ? { color: tone } : {}}>{v}</div></div>;
}
function Stat({ k, v, tone, sub }: { k: string; v: string; tone?: string; sub?: string }) {
  return <div className="card-lux rounded-xl px-4 py-3.5">
    <div className="text-[11.5px] text-muted-foreground mb-1.5">{k}</div>
    <div className="text-[24px] font-extrabold font-mono tracking-tight" style={tone ? { color: tone } : {}}>{v}</div>
    {sub && <div className="text-[11px] text-faint mt-0.5">{sub}</div>}
  </div>;
}
function Th({ children, r }: { children: React.ReactNode; r?: boolean }) {
  return <th className={"px-4 py-2.5 " + (r ? "text-right" : "text-left")}>{children}</th>;
}

function RolesCard() {
  const [tracks, setTracks] = useState<{ track: string; commission_enabled: boolean }[]>([]);
  const [newRole, setNewRole] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => fetch("/api/portal/track-settings").then((r) => r.json()).then((d) => setTracks(d.tracks || [])).catch(() => {});
  useEffect(() => { load(); }, []);
  async function toggle(track: string, enabled: boolean) {
    setBusy(true);
    try { await fetch("/api/portal/track-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ track, enabled }) }); await load(); } finally { setBusy(false); }
  }
  async function addRole(e: React.FormEvent) {
    e.preventDefault(); if (!newRole.trim()) return; setBusy(true);
    try { await fetch("/api/portal/track-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ track: newRole.trim(), enabled: true }) }); setNewRole(""); await load(); } finally { setBusy(false); }
  }
  return (
    <div className="card-lux rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border"><b className="font-serif text-[15px] font-[600]">Roles &amp; commission</b> <span className="text-[11.5px] text-faint">which roles are on the commission model</span></div>
      <div className="p-5">
        <div className="grid gap-2 mb-4">
          {tracks.length === 0 && <span className="text-[12.5px] text-faint">No roles yet — they appear as you add employees, or add one below.</span>}
          {tracks.map((t) => (
            <div key={t.track} className="flex items-center justify-between neu-inset rounded-xl px-3.5 py-2.5">
              <span className="text-[13px] font-[560]">{t.track}</span>
              <button disabled={busy} onClick={() => toggle(t.track, !t.commission_enabled)} className={"rounded-full px-3 py-1 text-[11.5px] font-[600] " + (t.commission_enabled ? "btn-gold" : "bg-card ring-hairline text-muted-foreground")}>
                {t.commission_enabled ? "Commission ON" : "No commission"}
              </button>
            </div>
          ))}
        </div>
        <form onSubmit={addRole} className="flex items-center gap-2">
          <input value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="Add a role (e.g. Finance)" className="flex-1 text-[13px] neu-inset rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-gold/25" />
          <button type="submit" disabled={busy} className={GOLD + " text-[12.5px] px-4 py-2"}>Add role</button>
        </form>
        <p className="text-[11px] text-faint mt-2.5">Turn a role OFF and its employees move to “Team (no commission)” and lose the referral-code section.</p>
      </div>
    </div>
  );
}
