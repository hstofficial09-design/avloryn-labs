"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogoMark } from "@/components/ui/logo";
import { PasswordInput } from "@/components/ui/password-input";
import SystemWatch from "./SystemWatch";
import Birthdays, { type BirthdayRow } from "./Birthdays";

const GHOST = "rounded-full bg-card ring-hairline hover:bg-muted text-foreground font-[520] transition-colors";
const GOLD = "btn-gold rounded-full font-[560]";

export default function PortalHub({ role, name, isOwner, isCommissionRole, isBd, isPartner, needsPayout, birthdays, birthdaysMissing }: { role: string; name: string; isOwner: boolean; isCommissionRole: boolean; isBd?: boolean; isPartner?: boolean; needsPayout?: boolean; birthdays?: BirthdayRow[]; birthdaysMissing?: number }) {
  const router = useRouter();
  const [showPw, setShowPw] = useState(false);
  const [cur, setCur] = useState(""); const [nw, setNw] = useState(""); const [nw2, setNw2] = useState("");
  const [pmsg, setPmsg] = useState<{ ok: boolean; t: string } | null>(null); const [pbusy, setPbusy] = useState(false);
  async function logout() { await fetch("/api/portal/logout", { method: "POST" }); router.push("/portal/login"); }
  async function changePw(e: React.FormEvent) {
    e.preventDefault(); setPmsg(null);
    if (nw.length < 4) { setPmsg({ ok: false, t: "New password must be at least 4 characters." }); return; }
    if (nw !== nw2) { setPmsg({ ok: false, t: "The two new passwords don't match." }); return; }
    setPbusy(true);
    try {
      const r = await fetch("/api/portal/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current: cur, new: nw }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.success) { setPmsg({ ok: true, t: "Password updated." }); setCur(""); setNw(""); setNw2(""); }
      else setPmsg({ ok: false, t: d.error || "Could not change password." });
    } catch { setPmsg({ ok: false, t: "Network error — try again." }); }
    finally { setPbusy(false); }
  }
  const pwInput = "w-full text-[13px] neu-inset text-foreground placeholder:text-faint rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-gold/25 mb-2.5";
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  type Card = { title: string; desc: string; href?: string; external?: boolean; onClick?: () => void; icon: React.ReactNode; feature?: boolean };
  // A network partner is an outside recruiter, not staff: they do not take internal meetings and
  // they have no work log to keep. Showing them tools they can neither use nor be judged on just
  // buries the one thing they came for — their earnings.
  const cards: Card[] = [];
  if (!isPartner) {
    cards.push({ title: "Scheduling", desc: "Create meetings, share booking links, manage your calendar & Meet.", href: "/meet/admin", icon: <CalIcon />, feature: true });
    cards.push({ title: isOwner ? "Tasks & Reviews" : "My Work Log", desc: isOwner
      ? "Assign work with deadlines, tick off what's delivered, score each week and issue the report."
      : "Write down what you're working on. Dated, numbered, and downloadable as a PDF whenever you want.",
      href: "/portal/tasks", icon: <TaskIcon /> });
  }
  if (isOwner || isCommissionRole) cards.push({
    title: isOwner ? "Team & Commissions" : "My Earnings",
    desc: isOwner ? "Employees, referral codes, commissions and payouts."
      : "Your referral code, sales and payouts.",
    href: "/portal/commissions", icon: <CoinIcon />, feature: isPartner });
  if (isOwner || isBd) cards.push({ title: isOwner ? "Partner Network" : "My Network", desc: isOwner ? "Everyone on the team, the network partners they recruit, and the 2% override across every network." : "Add network partners (CAs, influencers, agencies) and earn a 2% override on your whole network.", href: "/portal/network", icon: <NetworkIcon /> });
  if (isOwner) cards.push({ title: "Onboarding Form", desc: "Roles, pay, form fields and each role's terms for new hires.", href: "/portal/onboarding", icon: <FormIcon /> });
  if (isOwner) cards.push({ title: "Careers", desc: "Post openings on the website and take applications by email.", href: "/portal/careers", icon: <BriefcaseIcon /> });
  if (isOwner) cards.push({ title: "LivoDraft", desc: "Open the full LivoDraft admin — codes, users, billing, refunds, payouts, AI & more.", href: "/portal/go/livodraft", external: true, icon: <ProductIcon /> });
  cards.push({ title: isPartner ? "My Details & Payout" : "My Profile",
    // Payout details are how a partner actually gets paid, and nothing else prompts them for it —
    // an unpaid partner who never filled these in looks identical to one nobody has paid yet.
    desc: isPartner ? "Your contact details, and the bank account or UPI your commission is paid into."
      : "Your personal details — name, contact, date of birth, address.",
    href: "/portal/profile", icon: <UserIcon /> });
  // Partners point at the thing they are selling; staff at the company site.
  cards.push(isPartner
    ? { title: "LivoDraft", desc: "The product you're referring — open it to show someone what they're getting.", href: "https://livodraft.com", external: true, icon: <GlobeIcon /> }
    : { title: "Company site", desc: "View the public Avloryn Labs website.", href: "/", icon: <GlobeIcon /> });
  cards.push({ title: "Password", desc: "Change your account password securely.", onClick: () => setShowPw((v) => !v), icon: <LockIcon /> });
  cards.push({ title: "Support", desc: "Questions or an issue? Email contact@avloryn.com", href: "mailto:contact@avloryn.com", external: true, icon: <MailIcon /> });

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient premium background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10" style={{ background: "radial-gradient(1100px 620px at 12% -12%, rgba(203,177,118,0.22), transparent 60%), radial-gradient(900px 520px at 112% 6%, rgba(174,140,74,0.16), transparent 55%), radial-gradient(700px 500px at 50% 120%, rgba(203,177,118,0.12), transparent 60%), linear-gradient(180deg, #FBF9F5 0%, #F5EFE4 100%)" }} />
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 opacity-[0.5]" style={{ backgroundImage: "radial-gradient(rgba(13,13,13,0.045) 1px, transparent 1px)", backgroundSize: "22px 22px" }} />

      <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-8">
        <header className="flex items-center justify-between gap-3 flex-wrap mb-9">
          <div className="flex items-center gap-3">
            <LogoMark size={30} />
            <div><div className="font-serif text-[17px] font-[600] leading-none">Avloryn <span className="text-gold">Labs</span></div><div className="section-label mt-1">Company Dashboard</div></div>
          </div>
          <div className="flex items-center gap-3">
            <span className="section-label !text-gold bg-gold-soft/60 ring-hairline px-2.5 py-1 rounded-full">{isOwner ? "Owner" : role}</span>
            <button onClick={logout} className={GHOST + " text-[12.5px] px-3.5 py-1.5"}>Sign out</button>
          </div>
        </header>

        {/* Anything broken across Avloryn or LivoDraft, above everything else — an alert email can
            be missed, an open dashboard cannot. Renders nothing when there is nothing to say. */}
        <SystemWatch />

        {/* Nothing else in the portal ever asks for a bank account or UPI, so without this the
            first anyone discovers a payout cannot be made is when the owner tries to make it.
            Asked once, before there is money waiting, and gone the moment it is filled in. */}
        {needsPayout && (
          <a href="/portal/profile#payout" className="block mb-6 rounded-2xl p-4 sm:p-5 transition-colors hover:opacity-90"
             style={{ background: "rgba(174,140,74,0.08)", boxShadow: "inset 0 0 0 1px rgba(174,140,74,0.35)" }}>
            <div className="flex items-start gap-3">
              <span className="mt-1.5 inline-block w-2 h-2 rounded-full shrink-0" style={{ background: "#AE8C4A" }} />
              <div>
                <div className="font-[620] text-[14px]" style={{ color: "#8a6d33" }}>Add where your money should go</div>
                <div className="text-[12.5px] text-faint mt-1">
                  You have no bank account or UPI on file yet, so commission you earn cannot be paid out.
                  It takes a minute — add it now rather than when there is money waiting. <span className="text-gold font-[560]">Add payout details →</span>
                </div>
              </div>
            </div>
          </a>
        )}

        {/* Hero */}
        <div className="card-lux rounded-[26px] p-7 sm:p-9 mb-7 relative overflow-hidden">
          <div aria-hidden className="absolute -right-10 -top-14 w-56 h-56 rounded-full" style={{ background: "radial-gradient(circle, rgba(203,177,118,0.28), transparent 70%)" }} />
          <div className="section-label mb-2">{today}</div>
          <h1 className="font-serif text-[30px] sm:text-[34px] font-[600] tracking-[-0.015em] mb-1.5">Hi, {name} <span className="inline-block">👋</span></h1>
          <p className="text-[14px] text-muted-foreground max-w-[52ch]">{isPartner
            ? "Your referral code, what it has earned, and where your payout goes — all behind one login."
            : <>Welcome to your Avloryn workspace — scheduling, {isOwner || isCommissionRole ? "earnings, " : ""}and everything for your work, all behind one login.</>}</p>
        </div>

        {/* Everybody sees the same board — a reminder is no use only to the person who already
            knows. Renders nothing when no date of birth has been recorded. */}
        <Birthdays rows={birthdays || []} missing={birthdaysMissing} />

        <div className="section-label mb-3 px-1">Your tools</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((c) => {
            const inner = (
              <>
                <div className={"w-12 h-12 rounded-2xl grid place-items-center mb-4 " + (c.feature ? "text-[#3a2f10]" : "neu-chip text-gold")} style={c.feature ? { background: "linear-gradient(135deg, #EAD9AC, #CDB275 55%, #AE8C4A)" } : undefined}>{c.icon}</div>
                <div className="font-serif text-[17px] font-[600] mb-1 flex items-center gap-1.5">{c.title} <span className="text-gold text-[14px] transition-transform group-hover:translate-x-1">→</span></div>
                <p className="text-[12.5px] text-muted-foreground leading-relaxed">{c.desc}</p>
              </>
            );
            const cls = "group card-lux rounded-3xl p-5 sm:p-6 text-left hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_rgba(120,95,40,0.35)] transition-all duration-200 block";
            if (c.href) return <a key={c.title} href={c.href} target={c.external ? "_blank" : undefined} rel={c.external ? "noopener noreferrer" : undefined} className={cls}>{inner}</a>;
            return <button key={c.title} onClick={c.onClick} className={cls + " w-full"}>{inner}</button>;
          })}
        </div>

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

        <p className="text-center text-[11.5px] text-faint mt-10">Avloryn Labs · Company Dashboard</p>
      </div>
    </div>
  );
}

function TaskIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z" />
      <path d="M16 6h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h2" />
      <path d="m9 12 1.8 1.8L14.5 10" />
      <path d="M9 17h6" />
    </svg>
  );
}
function CalIcon() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></svg>; }
function CoinIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v9M9.5 9.5h3.2a1.8 1.8 0 010 3.6H9.8" /></svg>; }
function GlobeIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.5 2.5 14 0 17M12 3.5c-2.5 2.5-2.5 14 0 17" /></svg>; }
function LockIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 018 0v3" /></svg>; }
function MailIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M4 6.5l8 6 8-6" /></svg>; }
function UserIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="8" r="3.6" /><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" /></svg>; }
function BriefcaseIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="3" y="7.5" width="18" height="13" rx="2.5" /><path d="M9 7.5V6a2 2 0 012-2h2a2 2 0 012 2v1.5M3 12.5h18" /></svg>; }
function FormIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>; }
function NetworkIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="2.4" /><circle cx="5" cy="19" r="2.4" /><circle cx="19" cy="19" r="2.4" /><path d="M12 7.4v3.2M11 12.2 6.6 16.8M13 12.2l4.4 4.6" /></svg>; }
function ProductIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.5 21 7v10l-9 4.5L3 17V7z" /><path d="M3 7l9 4.5L21 7M12 11.5V21" /></svg>; }
