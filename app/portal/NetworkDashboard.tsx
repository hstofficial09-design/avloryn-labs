"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogoMark } from "@/components/ui/logo";
import FamilyChart, { type TreeNode } from "./FamilyChart";

export type NetworkPartner = {
  id: string; name: string; role: string | null; code: string;
  orders: number; sales: number; partner_commission: number; bd_commission: number; bd_pending: number;
};
export type PartnerBd = { id: string; name: string; network: NetworkPartner[]; bd_earned: number; bd_pending: number };
export type PendingPartner = { id: string; name: string; email: string | null; role: string | null; bd_name: string; code: string };
export type PartnerUser = { name: string; email: string; docs: number; spent: number; commission: number; pending: number; paid: number };

const inr = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const GHOST = "rounded-full bg-card ring-hairline hover:bg-muted text-foreground font-[520] transition-colors";
const GOLD = "btn-gold rounded-full font-[560]";

export default function NetworkDashboard(props: {
  mode: "owner" | "bd";
  name: string;
  isBd?: boolean;
  network?: NetworkPartner[];
  bds?: PartnerBd[];
  roles?: string[];
  attachable?: { id: string; name: string; emp_type: string }[];
  pending?: PendingPartner[];
  users?: PartnerUser[];
  error?: string | null;
}) {
  const router = useRouter();
  const { mode, name, isBd, network = [], bds = [], roles = [], attachable = [], pending = [], users = [], error } = props;
  const [busy, setBusy] = useState(false);
  async function logout() { await fetch("/api/portal/logout", { method: "POST" }); router.push("/portal/login"); }

  async function approvePartner(id: string, name: string) {
    if (!confirm(`Approve ${name}? A login password will be emailed straight to them and their code goes live. (The BD won't see the password.)`)) return;
    setBusy(true);
    try {
      const r = await fetch("/api/portal/partner/approve", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employee_id: id }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) { alert(d.emailed ? `✓ Approved — login emailed to ${name}.` : `✓ Approved. (⚠ email not sent — set RESEND_API_KEY.)`); router.refresh(); }
      else alert(d.error || "Could not approve");
    } catch { alert("Network error"); }
    finally { setBusy(false); }
  }

  // BD add-network-partner form
  const [ownerMode, setOwnerMode] = useState<"new" | "existing">("new");
  const [nName, setNName] = useState("");
  const [nRole, setNRole] = useState(roles[0] || "");
  const [nEmail, setNEmail] = useState("");
  const [nMobile, setNMobile] = useState("");
  const [nExisting, setNExisting] = useState("");
  const [nRes, setNRes] = useState<{ ok: boolean; t: string } | null>(null);
  const input = "w-full text-[13px] neu-inset text-foreground placeholder:text-faint rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-gold/25";

  async function addPartner(e: React.FormEvent) {
    e.preventDefault(); setNRes(null);
    setBusy(true);
    try {
      let r: Response;
      if (ownerMode === "existing") {
        if (!nExisting) { setNRes({ ok: false, t: "Pick an existing person." }); setBusy(false); return; }
        r = await fetch("/api/portal/partner/attach-existing", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employee_id: nExisting }),
        });
      } else {
        if (!nName.trim()) { setNRes({ ok: false, t: "Enter the person's name." }); setBusy(false); return; }
        if (!nEmail.trim() || !nEmail.includes("@")) { setNRes({ ok: false, t: "A valid email is required — they log in with it." }); setBusy(false); return; }
        r = await fetch("/api/portal/partner/create", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nName.trim(), role: nRole, email: nEmail.trim(), mobile: nMobile.trim() }),
        });
      }
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) { setNRes({ ok: true, t: d.approved === false ? `Added — pending owner approval.` : `Code created: ${d.code}` }); setNName(""); setNEmail(""); setNMobile(""); setNExisting(""); router.refresh(); }
      else setNRes({ ok: false, t: d.error || "Could not add the network partner." });
    } catch { setNRes({ ok: false, t: "Network error — try again." }); }
    finally { setBusy(false); }
  }
  async function markPaid(id: string, amt: number) {
    if (!confirm(`Mark ${inr(amt)} override as paid for this BD? (Bank transfer already done)`)) return;
    setBusy(true);
    await fetch("/api/portal/mark-paid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employee_id: id }) });
    setBusy(false); router.refresh();
  }

  const netTotals = network.reduce(
    (a, s) => ({ sales: a.sales + s.sales, bd: a.bd + s.bd_commission, pending: a.pending + s.bd_pending }),
    { sales: 0, bd: 0, pending: 0 });

  return (
    <main className="portal-light min-h-screen font-sans px-4 sm:px-6 py-7">
      <div className="max-w-[1000px] mx-auto">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <LogoMark size={30} />
            <div><div className="font-serif text-[17px] font-[600] leading-none">Avloryn <span className="text-gold">Labs</span></div><div className="section-label mt-1">Partner Portal</div></div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/portal" className={GHOST + " text-[12.5px] px-3.5 py-1.5"}>← Home</a>
            <button onClick={logout} className={GHOST + " text-[12.5px] px-3.5 py-1.5"}>Sign out</button>
          </div>
        </header>

        <h1 className="font-serif text-[30px] font-[600] tracking-[-0.01em] mt-6 mb-1">
          {mode === "owner" ? "Partner Network" : "My Network"}
        </h1>
        <p className="text-[13.5px] text-muted-foreground mb-6">
          {mode === "owner"
            ? "Every BD intern and the network partners they recruited. Each BD earns a 2% override on their whole network — pay by bank transfer, then Mark Paid."
            : "Network partners you bring on — CAs, influencers, agencies. You earn a 2% override on every sale across your whole network, for life."}
        </p>

        {error ? (
          <div className="rounded-xl border border-[#eeddb0] bg-[#fdf5e3] text-[#946412] text-[13px] px-4 py-3">⚠ {error}</div>
        ) : mode === "bd" && !isBd ? (
          <div className="card-lux rounded-2xl px-5 py-6 text-[13.5px] text-muted-foreground">
            You don&rsquo;t have a partner network yet. Once you&rsquo;re set up as a BD, you&rsquo;ll be able to add network partners and track your override here.
          </div>
        ) : mode === "bd" ? (
          <>
            <div className="grid grid-cols-3 gap-3 mb-5">
              <Stat k="Network sales" v={inr(netTotals.sales)} />
              <Stat k="Override earned" v={inr(netTotals.bd)} tone="#A9852F" />
              <Stat k="Pending payout" v={inr(netTotals.pending)} tone="#946412" />
            </div>

            <form onSubmit={addPartner} className="card-lux rounded-2xl p-5 mb-5">
              <div className="font-serif text-[15px] font-[600] mb-1">Add a network partner</div>
              <p className="text-[12.5px] text-muted-foreground mb-3">They&rsquo;re added as <b>pending</b> — once the owner approves, we email them a login and their code goes live. Buyers get 25% off their first document; the partner earns 10%.</p>
              <div className="flex gap-4 mb-3 text-[13px]">
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" checked={ownerMode === "new"} onChange={() => setOwnerMode("new")} /> New person</label>
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" checked={ownerMode === "existing"} onChange={() => setOwnerMode("existing")} /> Existing person</label>
              </div>
              {ownerMode === "new" ? (
                <div className="grid sm:grid-cols-2 gap-2.5">
                  <input value={nName} onChange={(e) => setNName(e.target.value)} placeholder="Full name" className={input} />
                  <select value={nRole} onChange={(e) => setNRole(e.target.value)} className={input + " appearance-none"}>
                    {roles.length === 0 && <option value="">Role</option>}
                    {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <input value={nEmail} onChange={(e) => setNEmail(e.target.value)} placeholder="Email (required — they log in with it)" className={input} />
                  <input value={nMobile} onChange={(e) => setNMobile(e.target.value)} placeholder="Mobile (optional)" className={input} />
                </div>
              ) : (
                <div>
                  <select value={nExisting} onChange={(e) => setNExisting(e.target.value)} className={input + " appearance-none"}>
                    <option value="">— pick an existing person —</option>
                    {attachable.map((a) => <option key={a.id} value={a.id}>{a.name}{a.emp_type === "intern" ? " · Intern" : ""}</option>)}
                  </select>
                  <p className="text-[11.5px] text-faint mt-1.5">Only people who aren&rsquo;t already in a network and don&rsquo;t have a code yet appear here.{attachable.length === 0 ? " None available right now." : ""}</p>
                </div>
              )}
              {nRes && <div className={"text-[12.5px] mt-2.5 " + (nRes.ok ? "text-[#1e7a44] font-mono font-[560]" : "text-[#b3341f]")}>{nRes.ok ? "✓ " : ""}{nRes.t}</div>}
              <button type="submit" disabled={busy} className={GOLD + " text-[12.5px] px-4 py-2 mt-3 disabled:opacity-60"}>{busy ? "Generating…" : "Generate code"}</button>
            </form>

            <div className="card-lux rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border"><b className="font-serif text-[15px] font-[600]">Your network partners</b></div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[640px]">
                  <thead><tr className="section-label bg-subtle/60">
                    <Th>Role</Th><Th>Name</Th><Th>Code</Th><Th r>Sales</Th><Th r>Their 10%</Th><Th r>Your 2%</Th><Th r>Pending</Th>
                  </tr></thead>
                  <tbody>
                    {network.length === 0 && <tr><td colSpan={7} className="text-center text-faint py-6">No network partners yet — add your first one above.</td></tr>}
                    {network.map((sv) => (
                      <tr key={sv.id} className="border-t border-border">
                        <td className="px-4 py-3">{sv.role || "—"}</td>
                        <td className="px-4 py-3 font-[560]">{sv.name}</td>
                        <td className="px-4 py-3 font-mono text-[12px] text-gold font-[600]">{sv.code || "—"}</td>
                        <td className="px-4 py-3 text-right font-mono">{inr(sv.sales)}</td>
                        <td className="px-4 py-3 text-right font-mono">{inr(sv.partner_commission)}</td>
                        <td className="px-4 py-3 text-right font-mono" style={{ color: "#A9852F" }}>{inr(sv.bd_commission)}</td>
                        <td className="px-4 py-3 text-right font-mono text-[#946412]">{inr(sv.bd_pending)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <section className="mt-8">
              <h2 className="font-serif text-[20px] font-[600] tracking-[-0.01em] mb-1">Users across your network</h2>
              <p className="text-[13px] text-muted-foreground mb-3">Every student your partners brought in — spend and the commission they generated. Emails masked for privacy.</p>
              <div className="card-lux rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px] min-w-[560px]">
                    <thead><tr className="section-label bg-subtle/60">
                      <Th>Student</Th><Th>Email</Th><Th r>Docs</Th><Th r>Spent</Th><Th r>Commission</Th>
                    </tr></thead>
                    <tbody>
                      {users.length === 0 && <tr><td colSpan={5} className="text-center text-faint py-6">No users yet.</td></tr>}
                      {users.map((u, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-4 py-3 font-[560]">{u.name}</td>
                          <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground">{u.email}</td>
                          <td className="px-4 py-3 text-right font-mono">{u.docs}</td>
                          <td className="px-4 py-3 text-right font-mono">{inr(u.spent)}</td>
                          <td className="px-4 py-3 text-right font-mono">{inr(u.commission)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section className="mt-8">
              <h2 className="font-serif text-[20px] font-[600] tracking-[-0.01em] mb-1">Your family</h2>
              <p className="text-[13px] text-muted-foreground mb-3">Your network at a glance — you, and the partners under you.</p>
              <FamilyChart root={{ name: "Avloryn Labs", label: "Company", children: [
                { name, label: "BD", you: true, children: network.map((p) => ({ name: p.name, label: p.role || "partner", note: inr(p.sales) })) },
              ] }} />
            </section>
          </>
        ) : (
          // OWNER OBSERVER
          <>
            {pending.length > 0 && (
              <div className="card-lux rounded-2xl overflow-hidden mb-6 ring-1 ring-[hsl(var(--gold)/0.35)]">
                <div className="px-5 py-3.5 border-b border-border bg-gold-soft/40">
                  <b className="font-serif text-[15px] font-[600]">Pending approval</b>{" "}
                  <span className="text-[11.5px] text-faint">a BD added these — approve to email them a login and switch their code live</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px] min-w-[620px]">
                    <thead><tr className="section-label bg-subtle/60">
                      <Th>Name</Th><Th>Role</Th><Th>Email</Th><Th>Under BD</Th><Th>Code</Th><Th>Action</Th>
                    </tr></thead>
                    <tbody>
                      {pending.map((p) => (
                        <tr key={p.id} className="border-t border-border">
                          <td className="px-4 py-3 font-[560]">{p.name}</td>
                          <td className="px-4 py-3">{p.role || "—"}</td>
                          <td className="px-4 py-3 text-[12px]">{p.email || <span className="text-[#b3341f]">no email</span>}</td>
                          <td className="px-4 py-3">{p.bd_name || "—"}</td>
                          <td className="px-4 py-3 font-mono text-[12px] text-gold font-[600]">{p.code || "—"}</td>
                          <td className="px-4 py-3">
                            <button disabled={busy || !p.email} onClick={() => approvePartner(p.id, p.name)} className={GOLD + " text-[11.5px] px-3 py-1.5 disabled:opacity-50"}>Approve</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {bds.length === 0 && (
              <div className="card-lux rounded-2xl px-5 py-6 text-[13.5px] text-muted-foreground">
                No BD networks yet. Create a BD and their network partners from the LivoDraft admin — they&rsquo;ll appear here automatically.
              </div>
            )}
            <div className="space-y-5">
              {bds.map((bd) => (
                <div key={bd.id} className="card-lux rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3.5 border-b border-border">
                    <div>
                      <span className="font-serif text-[15px] font-[600]">{bd.name}</span>
                      <span className="text-[11.5px] text-faint"> · BD intern · {bd.network.length} network partner{bd.network.length === 1 ? "" : "s"}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-[12px] text-muted-foreground">Override earned <b className="font-mono" style={{ color: "#A9852F" }}>{inr(bd.bd_earned)}</b></span>
                      {bd.bd_pending > 0
                        ? <button disabled={busy} onClick={() => markPaid(bd.id, bd.bd_pending)} className={GOLD + " text-[11.5px] px-3 py-1.5"}>Mark {inr(bd.bd_pending)} Paid</button>
                        : <span className="text-[11.5px] text-faint">Settled ✓</span>}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px] min-w-[600px]">
                      <thead><tr className="section-label bg-subtle/60">
                        <Th>Role</Th><Th>Network Partner</Th><Th>Code</Th><Th r>Sales</Th><Th r>Their 10%</Th><Th r>BD 2%</Th><Th r>Pending</Th>
                      </tr></thead>
                      <tbody>
                        {bd.network.length === 0 && <tr><td colSpan={7} className="text-center text-faint py-5">No network partners yet.</td></tr>}
                        {bd.network.map((s) => (
                          <tr key={s.id} className="border-t border-border">
                            <td className="px-4 py-2.5">{s.role || "—"}</td>
                            <td className="px-4 py-2.5 font-[560]">{s.name}</td>
                            <td className="px-4 py-2.5 font-mono text-[12px] text-gold font-[600]">{s.code || "—"}</td>
                            <td className="px-4 py-2.5 text-right font-mono">{inr(s.sales)}</td>
                            <td className="px-4 py-2.5 text-right font-mono">{inr(s.partner_commission)}</td>
                            <td className="px-4 py-2.5 text-right font-mono" style={{ color: "#A9852F" }}>{inr(s.bd_commission)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-[#946412]">{inr(s.bd_pending)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>

            {bds.length > 0 && (
              <section className="mt-8">
                <h2 className="font-serif text-[20px] font-[600] tracking-[-0.01em] mb-1">The family</h2>
                <p className="text-[13px] text-muted-foreground mb-3">Your whole network — every BD and the partners under them.</p>
                <FamilyChart root={{ name: "Avloryn Labs", label: "Owner", you: true,
                  children: bds.map((bd) => ({ name: bd.name, label: "BD", note: inr(bd.bd_earned) + " override",
                    children: bd.network.map((p) => ({ name: p.name, label: p.role || "partner", note: inr(p.sales) })) })) }} />
              </section>
            )}
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
