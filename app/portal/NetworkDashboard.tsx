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
export type PartnerPerson = {
  id: string; name: string; role: string; code: string;
  direct_sales: number; direct_earned: number; direct_pending: number;
  override_earned: number; override_pending: number;
  network: NetworkPartner[];
};

const inr = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const GHOST = "rounded-full bg-card ring-hairline hover:bg-muted text-foreground font-[520] transition-colors";
const GOLD = "btn-gold rounded-full font-[560]";

export type AssignableParent = { id: string; name: string; role: string };

export default function NetworkDashboard(props: {
  mode: "owner" | "bd";
  name: string;
  myRole?: string;
  parents?: AssignableParent[];
  isBd?: boolean;
  network?: NetworkPartner[];
  bds?: PartnerBd[];
  people?: PartnerPerson[];
  roles?: string[];
  attachable?: { id: string; name: string; emp_type: string }[];
  pending?: PendingPartner[];
  users?: PartnerUser[];
  error?: string | null;
}) {
  const router = useRouter();
  const { mode, name, myRole, parents = [], isBd, network = [], people = [], roles = [], attachable = [], pending = [], users = [], error } = props;
  const [busy, setBusy] = useState(false);
  // owner: which team member's card is open
  const [selId, setSelId] = useState<string>("");
  const sel = people.find((p) => p.id === selId) || people[0];
  async function logout() { await fetch("/api/portal/logout", { method: "POST" }); router.push("/portal/login"); }

  async function approvePartner(id: string, name: string) {
    if (!confirm(`Approve ${name}? A login password will be emailed straight to them and their code goes live. (Their upline won't see the password.)`)) return;
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
  const [roleList, setRoleList] = useState<string[]>(roles);
  const [nRole, setNRole] = useState(roles[0] || "");
  // Roles are managed only by the owner (RoleManager below) — a BD can no longer add one inline.
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
    if (!confirm(`Mark ${inr(amt)} as paid for this person? (Bank transfer already done)`)) return;
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
            ? "Every team member and the network partners they recruited. Each upline earns a 2% override on their whole network — pay by bank transfer, then Mark Paid."
            : "Network partners you bring on — campus ambassadors, influencers, thesis-writing agencies. You earn a 2% override on every sale across your whole network, for life."}
        </p>

        {error ? (
          <div className="rounded-xl border border-[#eeddb0] bg-[#fdf5e3] text-[#946412] text-[13px] px-4 py-3">⚠ {error}</div>
        ) : mode === "bd" && !isBd ? (
          <div className="card-lux rounded-2xl px-5 py-6 text-[13.5px] text-muted-foreground">
            This page opens up once your account is active and approved. Then anyone you bring in
            as a network partner shows up here, along with the 2% you earn on their sales.
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
                  <div>
                    <select value={nRole} onChange={(e) => setNRole(e.target.value)} className={input + " appearance-none w-full"}>
                      {roleList.length === 0 && <option value="">Role</option>}
                      {roleList.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
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
                { name, label: myRole || "Team", you: true, children: network.map((p) => ({ name: p.name, label: p.role || "partner", note: inr(p.sales) })) },
              ] }} />
            </section>
          </>
        ) : (
          // OWNER OBSERVER
          <>
            <OwnerAddPartner roles={roleList} parents={parents} onDone={() => router.refresh()} />

            <RoleManager roles={roleList} setRoles={setRoleList} canDelete />

            {pending.length > 0 && (
              <div className="card-lux rounded-2xl overflow-hidden mb-6 ring-1 ring-[hsl(var(--gold)/0.35)]">
                <div className="px-5 py-3.5 border-b border-border bg-gold-soft/40">
                  <b className="font-serif text-[15px] font-[600]">Pending approval</b>{" "}
                  <span className="text-[11.5px] text-faint">someone added these — approve to email them a login and switch their code live</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px] min-w-[620px]">
                    <thead><tr className="section-label bg-subtle/60">
                      <Th>Name</Th><Th>Role</Th><Th>Email</Th><Th>Upline</Th><Th>Code</Th><Th>Action</Th>
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
            {people.length === 0 ? (
              <div className="card-lux rounded-2xl px-5 py-6 text-[13.5px] text-muted-foreground">
                No team members yet. Add people from onboarding, or give someone a code in the LivoDraft admin — everyone shows up here.
              </div>
            ) : (
              <>
                {/* Everyone on the team — click a name to open their code, earnings & network */}
                <div className="flex gap-2 flex-wrap mb-4">
                  {people.map((p) => {
                    const on = sel?.id === p.id;
                    return (
                      <button key={p.id} type="button" onClick={() => setSelId(p.id)}
                        className={"rounded-full px-3.5 py-1.5 text-[12.5px] font-[560] ring-1 transition-colors " +
                          (on ? "bg-gold-soft/60 ring-[hsl(var(--gold)/0.5)] text-foreground"
                              : "bg-card ring-border hover:ring-[hsl(var(--gold)/0.4)] text-muted-foreground")}>
                        {p.name}{p.network.length > 0 && <span className="ml-1.5 text-[11px] text-gold">+{p.network.length}</span>}
                      </button>
                    );
                  })}
                </div>

                {sel && (
                  <div className="card-lux rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3.5 border-b border-border">
                      <div>
                        <span className="font-serif text-[15px] font-[600]">{sel.name}</span>
                        <span className="text-[11.5px] text-faint"> · {sel.role} · {sel.code
                          ? <span className="font-mono text-gold font-[600]">{sel.code}</span>
                          : <span className="text-[#b3341f]">no code yet</span>}</span>
                      </div>
                      {(sel.direct_pending + sel.override_pending) > 0
                        ? <button disabled={busy} onClick={() => markPaid(sel.id, sel.direct_pending + sel.override_pending)} className={GOLD + " text-[11.5px] px-3 py-1.5"}>Mark {inr(sel.direct_pending + sel.override_pending)} Paid</button>
                        : <span className="text-[11.5px] text-faint">Settled ✓</span>}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4">
                      <Stat k="Their sales" v={inr(sel.direct_sales)} />
                      <Stat k="Direct earned" v={inr(sel.direct_earned)} />
                      <Stat k="Direct pending" v={inr(sel.direct_pending)} tone="#946412" />
                      <Stat k="Override earned" v={inr(sel.override_earned)} tone="#A9852F" />
                    </div>
                    {sel.network.length > 0 ? (
                      <div className="overflow-x-auto border-t border-border">
                        <table className="w-full text-[13px] min-w-[600px]">
                          <thead><tr className="section-label bg-subtle/60">
                            <Th>Role</Th><Th>Network Partner</Th><Th>Code</Th><Th r>Sales</Th><Th r>Their 10%</Th><Th r>Override 2%</Th><Th r>Pending</Th>
                          </tr></thead>
                          <tbody>
                            {sel.network.map((s) => (
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
                    ) : (
                      <div className="px-5 py-4 text-[12.5px] text-faint border-t border-border">No one under {sel.name} yet.{sel.code ? "" : " Give them a code in the LivoDraft admin so they can start referring."}</div>
                    )}
                  </div>
                )}

                <section className="mt-8">
                  <h2 className="font-serif text-[20px] font-[600] tracking-[-0.01em] mb-1">The family</h2>
                  <p className="text-[13px] text-muted-foreground mb-3">Your whole team — everyone, and the partners under them.</p>
                  <FamilyChart root={{ name: "Avloryn Labs", label: "Owner", you: true,
                    children: people.map((p) => ({ name: p.name, label: p.role || "team",
                      note: p.code ? inr(p.direct_earned) : "no code",
                      children: p.network.map((n) => ({ name: n.name, label: n.role || "partner", note: inr(n.sales) })) })) }} />
                </section>
              </>
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


/** Partner types, managed from the admin view. BDs get the same add box inside their
 *  add-partner form; removing a type is the owner's call and is refused while it is in use. */
/**
 * Owner-only: sign a partner up yourself.
 *
 * Two cases, one form. A partner who came to you directly sits under nobody — they earn their
 * usual 10% and no override is paid to anyone, because nobody introduced them. If you'd rather
 * reward someone, put them under any employee and that person earns the 2% override on them.
 * Either way the partner goes live immediately (you added them, so there is nothing to approve)
 * and gets their login by email.
 */
function OwnerAddPartner({ roles, parents, onDone }: { roles: string[]; parents: AssignableParent[]; onDone: () => void }) {
  const input = "w-full text-[13px] neu-inset text-foreground placeholder:text-faint rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-gold/25";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [role, setRole] = useState(roles[0] || "");
  const [parent, setParent] = useState("");        // "" = direct, nobody above them
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; t: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setRes(null);
    if (!name.trim()) return setRes({ ok: false, t: "Enter their name." });
    if (!email.trim() || !email.includes("@")) return setRes({ ok: false, t: "A valid email is required — they log in with it." });
    setBusy(true);
    try {
      const r = await fetch("/api/portal/partner/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), mobile: mobile.trim(), role, bdId: parent }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) return setRes({ ok: false, t: d.error || "Could not add them." });
      const who = parent ? parents.find((p) => p.id === parent)?.name : "";
      setRes({ ok: true, t: `Code ${d.code} is live${who ? ` · under ${who} (they earn the 2%)` : " · direct, no override paid"}.`
        + (d.emailed ? " Login emailed." : " ⚠ Login email not sent.") + (d.warning ? ` ${d.warning}` : "") });
      setName(""); setEmail(""); setMobile("");
      onDone();
    } catch { setRes({ ok: false, t: "Network error — try again." }); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="card-lux rounded-2xl p-5 mb-6">
      <div className="font-serif text-[15px] font-[600] mb-1">Add a partner yourself</div>
      <p className="text-[12.5px] text-muted-foreground mb-3">
        For someone who came to you directly. They earn the usual 10% and buyers get 25% off their
        first document — but with nobody above them, no 2% override is paid out. Want to reward an
        employee for the introduction? Put the partner under them instead.
      </p>
      <div className="grid sm:grid-cols-2 gap-2.5">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={input} />
        <select value={role} onChange={(e) => setRole(e.target.value)} className={input + " appearance-none"}>
          {roles.length === 0 && <option value="">Partner type</option>}
          {roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (required — they log in with it)" className={input} />
        <input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Mobile (optional)" className={input} />
      </div>
      <div className="mt-2.5">
        <label className="section-label block mb-1">Put them under</label>
        <select value={parent} onChange={(e) => setParent(e.target.value)} className={input + " appearance-none"}>
          <option value="">Nobody — direct to Avloryn (no override paid)</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.role ? ` · ${p.role}` : ""} — they earn 2%</option>
          ))}
        </select>
      </div>
      {res && <div className={"text-[12.5px] mt-2.5 " + (res.ok ? "text-[#1e7a44] font-[560]" : "text-[#b3341f]")}>{res.ok ? "✓ " : ""}{res.t}</div>}
      <button type="submit" disabled={busy} className={GOLD + " text-[12.5px] px-4 py-2 mt-3 disabled:opacity-60"}>
        {busy ? "Adding…" : "Add partner"}
      </button>
    </form>
  );
}

function RoleManager({ roles, setRoles, canDelete }: { roles: string[]; setRoles: (r: string[]) => void; canDelete?: boolean }) {
  const input = "w-full text-[13px] neu-inset text-foreground placeholder:text-faint rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-gold/25";
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function call(action: string, role: string) {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/portal/partner/roles", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, role }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not save");
      setRoles(d.roles || []);
      if (action === "add") setName("");
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); }
    finally { setBusy(false); }
  }

  return (
    <div className="card-lux rounded-2xl p-5 mb-6">
      <div className="font-serif text-[15px] font-[600] mb-1">Partner types</div>
      <p className="text-[12.5px] text-muted-foreground mb-3">
        What a network partner can be — campus ambassador, influencer, agency, or anything else you
        start working with. People pick from this list when they add someone.
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        {roles.length === 0 && <span className="text-[12.5px] text-faint">No types yet — add the first one below.</span>}
        {roles.map((r) => (
          <span key={r} className="neu-chip rounded-full pl-3 pr-2 py-1 text-[12px] font-[560] inline-flex items-center gap-1.5">
            {r}
            {canDelete && (
              <button type="button" onClick={() => { if (confirm(`Remove the partner type “${r}”?`)) call("delete", r); }} disabled={busy}
                title={`Remove “${r}”`} className="text-[#b3341f] text-[14px] leading-none disabled:opacity-40">×</button>
            )}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (name.trim()) call("add", name.trim()); } }}
          placeholder="e.g. Campus Ambassador" className={input + " sm:max-w-xs text-[13px]"}
        />
        <button type="button" onClick={() => name.trim() && call("add", name.trim())} disabled={busy || !name.trim()}
          className={GOLD + " px-4 py-2 text-[12.5px] disabled:opacity-50"}>
          {busy ? "Saving…" : "Add type"}
        </button>
      </div>
      {err && <p className="text-[12px] text-[#b3341f] mt-2">{err}</p>}
    </div>
  );
}
