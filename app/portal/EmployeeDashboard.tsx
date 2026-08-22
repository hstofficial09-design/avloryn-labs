"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogoMark } from "@/components/ui/logo";
import { PasswordInput } from "@/components/ui/password-input";
import FamilyChart, { type TreeNode } from "./FamilyChart";
import { roleLabel } from "@/lib/role-label";

type Code = { code: string; commission_pct: number; active: number; uses: number };
type PromoCode = { code: string; type: string; value: number; commission_pct: number; active: boolean; uses: number };
type Data = {
  employee: { id: string; name: string; emp_type: string; track: string | null; commission_pct: number };
  summary?: { orders: number; sales: number; earned: number; pending: number; paid: number; codes?: Code[] };
  orders: { id: string; product: string; code: string | null; doc_ref: string | null; order_amount_inr: number; commission_pct: number; commission_inr: number; status: string; created_at: string }[];
};

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const GHOST = "rounded-full bg-card ring-hairline hover:bg-muted text-foreground font-[520] transition-colors";
const GOLD = "btn-gold rounded-full font-[560]";

type PartnerUser = { name: string; email: string; docs: number; spent: number; commission: number; pending: number; paid: number };
export default function EmployeeDashboard({ name, data, error, commissionRole, isPartner, bdName, users, refCode, refLink, livoBase, promoCodes = [] }: { name: string; data: Data | null; error: string | null; commissionRole?: boolean; isPartner?: boolean; bdName?: string; users?: PartnerUser[]; refCode?: string; refLink?: string; livoBase?: string; promoCodes?: PromoCode[] }) {
  const router = useRouter();
  async function logout() { await fetch("/api/portal/logout", { method: "POST" }); router.push("/portal/login"); }
  const [copied, setCopied] = useState(false);
  async function copyLink() { try { await navigator.clipboard.writeText(refLink || ""); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ } }
  const waMsg = refLink ? `Get your thesis done on LivoDraft — 25% off your first document with my link: ${refLink}` : "";
  const waHref = `https://wa.me/?text=${encodeURIComponent(waMsg)}`;

  const s = data?.summary;
  const emp = data?.employee;
  const codes = data?.summary?.codes || [];
  const primaryCode = codes[0]?.code || data?.orders?.find((o) => o.code)?.code || null;
  // "Your commission" is the standing rate on your own code — NOT whatever code happens to sort
  // first. summary.codes lists promo codes before partner ones, so a single 8% promo handed out
  // to close one sale was being displayed as the person's permanent rate.
  const promoSet = new Set(promoCodes.map((p) => p.code.toUpperCase()));
  const standingCode = codes.find((c) => !promoSet.has(c.code.toUpperCase()));
  const commissionPct = standingCode?.commission_pct ?? emp?.commission_pct ?? 10;
  // Only referral roles (a code, or a commission % set by the owner) get the commission view.
  // Internal roles like HR see a clean role + Scheduling view instead.
  const isCommissionRole = commissionRole ?? (codes.length > 0 || !!primaryCode || (emp?.commission_pct ?? 0) > 0);

  /** What each code has actually earned, read off the orders rather than guessed. */
  const perCode = (code: string) => {
    const rows = (data?.orders || []).filter((o) => (o.code || "").toUpperCase() === code.toUpperCase());
    return {
      uses: rows.length,
      earned: rows.reduce((a, o) => a + (o.commission_inr || 0), 0),
      sales: rows.reduce((a, o) => a + (o.order_amount_inr || 0), 0),
    };
  };

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
            <a href="/portal" className={GHOST + " text-[12.5px] px-3.5 py-1.5"}>← Home</a>
            <button onClick={() => setShowPw((v) => !v)} className={GHOST + " text-[12.5px] px-3.5 py-1.5"}>Change password</button>
            <button onClick={logout} className={GHOST + " text-[12.5px] px-3.5 py-1.5"}>Sign out</button>
          </div>
        </header>

        {showPw && (
          <form onSubmit={changePw} className="mt-5 card-lux rounded-2xl p-5 max-w-md">
            <div className="font-serif text-[15px] font-[600] mb-3">Change your password</div>
            <PasswordInput placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" className={pwInput} />
            <PasswordInput placeholder="New password" value={nw} onChange={(e) => setNw(e.target.value)} autoComplete="new-password" className={pwInput} />
            <PasswordInput placeholder="Confirm new password" value={nw2} onChange={(e) => setNw2(e.target.value)} autoComplete="new-password" className={pwInput} />
            {pmsg && <div className={"text-[12px] mb-2.5 " + (pmsg.ok ? "text-[#1e7a44]" : "text-[#b3341f]")}>{pmsg.t}</div>}
            <button type="submit" disabled={pbusy} className={GOLD + " text-[12.5px] px-4 py-2 disabled:opacity-60"}>{pbusy ? "Saving…" : "Update password"}</button>
          </form>
        )}

        <h1 className="font-serif text-[30px] font-[600] tracking-[-0.01em] mt-6 mb-1">Hi, {emp?.name || name} 👋</h1>
        <p className="text-[13.5px] text-muted-foreground mb-6">{isCommissionRole ? "Commission from every sale made with your code — shown per product. Payouts go to your bank." : "Your role and scheduling, all in one place."}</p>

        {error ? (
          <div className="rounded-xl border border-[#eeddb0] bg-[#fdf5e3] text-[#946412] text-[13px] px-4 py-3">⚠ {error}</div>
        ) : !emp ? (
          <div className="card-lux rounded-xl text-muted-foreground text-[13px] px-4 py-4">
            We couldn&rsquo;t load your profile right now. Please refresh, or contact the owner.
          </div>
        ) : !isCommissionRole ? (
          <>
            <div className="flex flex-wrap items-center gap-6 card-lux rounded-2xl px-5 py-4 mb-5">
              <div><div className="section-label">Role</div><div className="font-[560] mt-1">{roleLabel(emp)}</div></div>
              <div><div className="section-label">Company</div><div className="font-[560] mt-1">Avloryn Labs</div></div>
            </div>
            <div className="card-lux rounded-2xl px-5 py-5">
              <div className="font-serif text-[15px] font-[600] mb-1.5">Your work</div>
              <p className="text-[13px] text-muted-foreground mb-4">Your role doesn&rsquo;t use a referral code. Manage meetings and your calendar in Scheduling.</p>
              <a href="/meet/admin" className={GOLD + " text-[13px] px-4 py-2 inline-block"}>Open Scheduling →</a>
            </div>
          </>
        ) : (
          <>
            {/* Who you are — the code used to be crammed in here too, and then repeated twice
                below. It now lives in one place: the cards underneath. */}
            <div className="flex flex-wrap items-center gap-6 card-lux rounded-2xl px-5 py-4 mb-5">
              <div><div className="section-label">Role</div><div className="font-[560] mt-1">{roleLabel(emp)}</div></div>
              <div><div className="section-label">Your commission</div><div className="font-bold text-gold mt-1">{commissionPct}% of net sale</div></div>
              {isPartner && bdName && <div><div className="section-label">Your upline</div><div className="font-[560] mt-1">{bdName}</div></div>}
              <div><div className="section-label">Earned so far</div><div className="font-bold mt-1">{inr(s?.earned || 0)}</div></div>
            </div>

            <CodesSection
              refCode={refCode} refLink={refLink} waHref={waHref} livoBase={livoBase}
              copied={copied} onCopy={copyLink}
              partnerCodes={codes} promoCodes={promoCodes} perCode={perCode}
            />

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

            {isPartner && (
              <section className="mt-8">
                <h2 className="font-serif text-[20px] font-[600] tracking-[-0.01em] mb-1">Your users</h2>
                <p className="text-[13px] text-muted-foreground mb-3">Students who came through your code — what they spent and your commission. Emails are masked for privacy.</p>
                <div className="card-lux rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px] min-w-[600px]">
                      <thead><tr className="section-label bg-subtle/60">
                        <Th>Student</Th><Th>Email</Th><Th r>Docs</Th><Th r>Spent</Th><Th r>Your commission</Th><Th r>Pending</Th><Th r>Paid</Th>
                      </tr></thead>
                      <tbody>
                        {(users || []).length === 0 && <tr><td colSpan={7} className="text-center text-faint py-6">No users yet — share your code to start earning.</td></tr>}
                        {(users || []).map((u, i) => (
                          <tr key={i} className="border-t border-border">
                            <td className="px-4 py-3 font-[560]">{u.name}</td>
                            <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground">{u.email}</td>
                            <td className="px-4 py-3 text-right font-mono">{u.docs}</td>
                            <td className="px-4 py-3 text-right font-mono">{inr(u.spent)}</td>
                            <td className="px-4 py-3 text-right font-mono">{inr(u.commission)}</td>
                            <td className="px-4 py-3 text-right font-mono text-[#946412]">{inr(u.pending)}</td>
                            <td className="px-4 py-3 text-right font-mono text-[#1e7a44]">{inr(u.paid)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {isPartner && (() => {
              const youNode: TreeNode = {
                name: emp.name || "You", label: "Network Partner", you: true,
                details: [
                  { k: "Your code", v: refCode || primaryCode || "—" },
                  { k: "Students", v: String((users || []).length) },
                  { k: "They spent", v: inr((users || []).reduce((a, u) => a + u.spent, 0)), gold: true },
                  { k: "You earned", v: inr(s?.earned || 0), gold: true },
                  { k: "Pending payout", v: inr(s?.pending || 0) },
                ],
                children: (users || []).map((u) => ({
                  name: u.name, label: "student", note: inr(u.spent),
                  details: [
                    { k: "Documents", v: String(u.docs) },
                    { k: "They spent", v: inr(u.spent) },
                    { k: "You earned", v: inr(u.commission), gold: true },
                    { k: "Paid to you", v: inr(u.paid) },
                    { k: "Still pending", v: inr(u.pending) },
                  ],
                })),
              };
              const root: TreeNode = { name: "Avloryn Labs", label: "Company",
                children: [bdName ? { name: bdName, label: "Upline", children: [youNode] } : youNode] };
              return (
                <section className="mt-8">
                  <h2 className="font-serif text-[20px] font-[600] tracking-[-0.01em] mb-1">Your family</h2>
                  <p className="text-[13px] text-muted-foreground mb-3">Where you sit — your upline above you, and the students under you.</p>
                  <FamilyChart root={root} />
                </section>
              );
            })()}
          </>
        )}
      </div>
    </main>
  );
}

/**
 * Your codes.
 *
 * There are two completely different things here and they were previously shown as near-identical
 * one-line rows, twice over, with the explanation squeezed into grey text on the right — so nobody
 * could tell which code to send to whom, or what they'd earn from it.
 *
 * They differ in the thing that actually matters: a REFERRAL brings you a person (and pays you on
 * everything they ever buy), a PROMO discounts a single sale (and pays you once, on that sale).
 * Each now gets its own card that says what the buyer gets, what you get, and what it has earned
 * so far — read from the real orders, not asserted.
 */
function CodesSection({ refCode, refLink, waHref, livoBase, copied, onCopy, partnerCodes, promoCodes, perCode }: {
  refCode?: string; refLink?: string; waHref: string; livoBase?: string;
  copied: boolean; onCopy: () => void;
  partnerCodes: Code[];
  promoCodes: PromoCode[];
  perCode: (code: string) => { uses: number; earned: number; sales: number };
}) {
  const [copiedCode, setCopiedCode] = useState("");
  const copyCode = async (c: string) => {
    try { await navigator.clipboard.writeText(c); setCopiedCode(c); setTimeout(() => setCopiedCode(""), 1500); } catch { /* */ }
  };
  // A partner's affiliate code and the signup referral code are the same idea to the person
  // holding them; show the referral one if we have it, else the partner code.
  const shareCode = refCode || partnerCodes[0]?.code || "";
  const shareStats = shareCode ? perCode(shareCode) : null;
  if (!shareCode && promoCodes.length === 0) return null;

  return (
    <section className="mb-5">
      <h2 className="font-serif text-[18px] font-[600] tracking-[-0.01em] mb-1">Your codes</h2>
      <p className="text-[12.5px] text-muted-foreground mb-3 max-w-[70ch]">
        Two different jobs. Your <b>referral</b> brings you a person — they stay yours and you earn on
        everything they ever buy. A <b>promo</b> is for closing one sale — a discount you hand over,
        and you earn once on that sale.
      </p>

      {/* Side by side only when there is something in both. A lone empty promo card standing as
          tall as a full referral card just looked broken. */}
      <div className={promoCodes.length > 0 ? "grid lg:grid-cols-2 gap-4 items-start" : "space-y-3"}>
        {shareCode && (
          <div className="card-lux rounded-2xl p-5 ring-1 ring-[hsl(var(--gold)/0.35)]">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="section-label !text-gold">Referral — brings you people</div>
                <button type="button" onClick={() => copyCode(shareCode)} title="Copy code"
                  className="font-mono text-[24px] font-extrabold text-gold mt-1 hover:opacity-75 transition-opacity block text-left">
                  {shareCode}
                </button>
              </div>
              {refLink && (
                <img src={`${livoBase || "https://livodraft.com"}/qr?d=${encodeURIComponent(refLink)}`}
                  alt="Your referral QR" width={82} height={82}
                  className="rounded-lg ring-1 ring-border bg-white shrink-0" />
              )}
            </div>

            <dl className="text-[12.5px] border-t border-border pt-2.5 mb-3">
              <Row k="They get" v="25% off their first document" />
              <Row k="You get" v="commission on every document they ever buy — for life" gold />
              <Row k="Use it when" v="someone might come back again: a classmate, a junior, a group" />
            </dl>

            {shareStats && (
              <div className="flex gap-5 text-[12.5px] mb-3">
                <span className="text-muted-foreground">Used <b className="text-foreground font-mono">{shareStats.uses}×</b></span>
                <span className="text-muted-foreground">Earned <b className="text-gold font-mono">{inr(shareStats.earned)}</b></span>
              </div>
            )}

            {refLink ? (
              <>
                <div className="flex items-center gap-2 mb-2.5">
                  <input readOnly value={refLink} onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 min-w-0 text-[12px] neu-inset rounded-lg px-3 py-2 font-mono text-foreground" />
                  <button onClick={onCopy} className={GHOST + " text-[12px] px-3 py-2 shrink-0"}>{copied ? "Copied ✓" : "Copy link"}</button>
                </div>
                <a href={waHref} target="_blank" rel="noopener noreferrer" className={GOLD + " text-[12.5px] px-4 py-2 inline-block"}>Share on WhatsApp</a>
              </>
            ) : (
              <button onClick={() => copyCode(shareCode)} className={GHOST + " text-[12px] px-3.5 py-2"}>
                {copiedCode === shareCode ? "Copied ✓" : "Copy code"}
              </button>
            )}
          </div>
        )}

        <div className={"card-lux rounded-2xl " + (promoCodes.length === 0 ? "px-5 py-3.5" : "p-5")}>
          <div className="section-label mb-1">Promo — closes one sale</div>
          {promoCodes.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">
              You don&rsquo;t have one yet — ask the founder when you need a discount to close a specific
              sale. Your referral code above already earns you commission in the meantime.
            </p>
          ) : (
            <>
              <p className="text-[12.5px] text-muted-foreground mb-3 mt-1">
                A one-off discount for a buyer you&rsquo;re closing yourself. They don&rsquo;t become yours — you earn on that sale.
              </p>
              <div className="space-y-3">
                {promoCodes.map((p) => {
                  const st = perCode(p.code);
                  const off = p.type === "flat" ? `₹${p.value} off` : p.type === "free_pages" ? `${p.value} free pages` : `${p.value}% off`;
                  return (
                    <div key={p.code} className="border-t border-border pt-3 first:border-0 first:pt-0">
                      <div className="flex items-center justify-between gap-3 flex-wrap mb-1.5">
                        <button type="button" onClick={() => copyCode(p.code)} title="Copy code"
                          className="font-mono text-[17px] font-extrabold hover:opacity-75 transition-opacity">
                          {p.code}
                        </button>
                        <span className="text-[11.5px]">
                          {copiedCode === p.code
                            ? <span className="text-[#1e7a44] font-[600]">Copied ✓</span>
                            : !p.active
                              ? <span className="text-[#b3341f] font-[600]">Disabled — ask the founder</span>
                              : <span className="text-[#1e7a44] font-[600]">Active</span>}
                        </span>
                      </div>
                      <dl className="text-[12.5px]">
                        <Row k="They get" v={off} />
                        <Row k="You get" v={p.commission_pct > 0 ? `${p.commission_pct}% of that sale` : "no commission on this one"} gold={p.commission_pct > 0} />
                      </dl>
                      <div className="flex gap-5 text-[12px] mt-1.5 text-muted-foreground">
                        <span>Used <b className="text-foreground font-mono">{p.uses}×</b></span>
                        {st.earned > 0 && <span>Earned <b className="text-gold font-mono">{inr(st.earned)}</b></span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Row({ k, v, gold }: { k: string; v: string; gold?: boolean }) {
  return (
    <div className="flex gap-2 py-[3px]">
      <dt className="text-muted-foreground shrink-0 w-[74px]">{k}</dt>
      <dd className={gold ? "text-gold font-[560]" : "text-foreground"}>{v}</dd>
    </div>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return <div className="card-lux rounded-xl px-4 py-3.5"><div className="text-[11.5px] text-muted-foreground mb-1.5">{k}</div><div className="text-[23px] font-extrabold font-mono tracking-tight" style={tone ? { color: tone } : {}}>{v}</div></div>;
}
function Th({ children, r }: { children: React.ReactNode; r?: boolean }) {
  return <th className={"px-4 py-2.5 " + (r ? "text-right" : "text-left")}>{children}</th>;
}
