"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogoMark } from "@/components/ui/logo";

const GHOST = "rounded-full bg-card ring-hairline hover:bg-muted text-foreground font-[520] transition-colors";
const GOLD = "btn-gold rounded-full font-[560]";

// A stored date can be ISO ("2026-08-11") OR already formatted ("08 Aug 2026").
// toISO → YYYY-MM-DD for <input type="date"> (empty if unparseable), robust to either form.
// ⚠ Must read the LOCAL calendar date. This runs in the browser, so "31 Oct 2007" parses as
// local midnight and toISOString() re-expresses it in UTC — which in IST is the 30th. Saving
// then persisted that, quietly moving people's date of birth a day earlier each time.
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const toISO = (s?: string | null) => {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return String(s).slice(0, 10);
  const d = new Date(String(s));
  return isNaN(d.getTime()) ? "" : ymd(d);
};

export default function ProfileForm({ profile, isOwner }: { profile: any; isOwner: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(profile.full_name || profile.name || "");
  const [email, setEmail] = useState(profile.email || "");
  const [mobile, setMobile] = useState(profile.mobile || "");
  const [dob, setDob] = useState(toISO(profile.dob));
  const [startDate, setStartDate] = useState(toISO(profile.start_date));
  const [address, setAddress] = useState(profile.address || "");
  // The rest of what onboarding collected — shown here so the record stays correctable.
  const [idType, setIdType] = useState(profile.id_type || "");
  const [idNumber, setIdNumber] = useState(profile.id_number || "");
  const [isStudent, setIsStudent] = useState<string>(profile.is_student || "");
  const [college, setCollege] = useState(profile.college || "");
  const [studentId, setStudentId] = useState(profile.student_id || "");
  // Payout details (for commission auto-payout)
  const [pUpi, setPUpi] = useState(profile.payout_upi || "");
  const [pAccName, setPAccName] = useState(profile.payout_account_name || "");
  const [pAccNo, setPAccNo] = useState(profile.payout_account_no || "");
  const [pIfsc, setPIfsc] = useState(profile.payout_ifsc || "");
  const [pPan, setPPan] = useState(profile.payout_pan || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [mustComplete, setMustComplete] = useState(false);

  useEffect(() => { setMustComplete(new URLSearchParams(window.location.search).get("complete") === "1"); }, []);

  const role = profile.emp_type === "intern" ? `Intern${profile.track ? " · " + profile.track : ""}` : isOwner ? "Owner" : "Employee";

  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (!name.trim()) { setMsg({ ok: false, t: "Name is required." }); return; }
    if (mustComplete && !dob) { setMsg({ ok: false, t: "Please add your date of birth to continue." }); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/portal/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, mobile, dob, address, start_date: startDate,
          id_type: idType, id_number: idNumber, is_student: isStudent,
          // Cleared on purpose when the answer is No, so stale college details don't linger.
          college: isStudent === "Yes" ? college : "", student_id: isStudent === "Yes" ? studentId : "",
          payout_upi: pUpi, payout_account_name: pAccName, payout_account_no: pAccNo,
          payout_ifsc: pIfsc, payout_pan: pPan }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not save");
      setMsg({ ok: true, t: "Saved ✓" });
      if (mustComplete) { setTimeout(() => router.push("/portal"), 700); }
    } catch (e) { setMsg({ ok: false, t: e instanceof Error ? e.message : "Could not save" }); }
    finally { setBusy(false); }
  }

  const input = "w-full text-[14px] neu-inset text-foreground placeholder:text-faint rounded-[12px] px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-gold/25";
  const label = "block text-[12px] font-medium text-foreground/70 mb-1.5";

  return (
    <div className="max-w-[620px] mx-auto px-4 sm:px-6 py-8">
      <header className="flex items-center justify-between gap-3 flex-wrap mb-8">
        <div className="flex items-center gap-3">
          <LogoMark size={30} />
          <div><div className="font-serif text-[17px] font-[600] leading-none">Avloryn <span className="text-gold">Labs</span></div><div className="section-label mt-1">My Profile</div></div>
        </div>
        <a href="/portal" className={GHOST + " text-[12.5px] px-3.5 py-1.5"}>← Home</a>
      </header>

      {mustComplete && (
        <div className="rounded-2xl bg-[#fff7e6] border border-[#f0dca8] px-4 py-3 mb-5 text-[13px] text-[#7a5c15]">
          Please complete your profile (add your date of birth) to continue.
        </div>
      )}

      <div className="card-lux rounded-3xl p-6 sm:p-7">
        <h1 className="font-serif text-[24px] font-[600] mb-1">Your details</h1>
        <p className="text-[12.5px] text-muted-foreground mb-6">Role: <b className="text-foreground/75">{role}</b></p>
        <form onSubmit={save} className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={label}>Full name {!isOwner && <span className="text-faint font-normal">(set by admin — fixed)</span>}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={input + (isOwner ? "" : " opacity-70")} readOnly={!isOwner} required />
          </div>
          <div>
            <label className={label}>Email {!isOwner && <span className="text-faint font-normal">(login — fixed)</span>}</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input + (isOwner ? "" : " opacity-70")} readOnly={!isOwner} />
          </div>
          <div><label className={label}>Mobile</label><input value={mobile} onChange={(e) => setMobile(e.target.value)} className={input} /></div>
          <div><label className={label}>Date of birth {mustComplete && <span className="text-gold">*</span>}</label><input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={input} /></div>
          <div>
            <label className={label}>Start date {!isOwner && <span className="text-faint font-normal">(set by admin — fixed)</span>}</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={input + (isOwner ? "" : " opacity-70")} readOnly={!isOwner} />
          </div>
          <div className="sm:col-span-2"><label className={label}>Address</label><textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className={input + " resize-none"} /></div>
          {!isOwner && (
            <>
              <div className="sm:col-span-2 mt-1"><div className="section-label">Your details</div></div>
              <div>
                <label className={label}>Role {<span className="text-faint font-normal">(set by admin — fixed)</span>}</label>
                <input value={role} readOnly className={input + " opacity-70"} />
              </div>
              <div>
                <label className={label}>Duration <span className="text-faint font-normal">(set by admin — fixed)</span></label>
                <input value={profile.duration || "—"} readOnly className={input + " opacity-70"} />
              </div>
              <div>
                <label className={label}>Photo ID type</label>
                <select value={idType} onChange={(e) => setIdType(e.target.value)} className={input}>
                  <option value="">Select…</option>
                  {["PAN card", "College / Student ID", "Driving Licence", "Voter ID", "Passport"].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div><label className={label}>ID number</label><input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} className={input} /></div>
              <div>
                <label className={label}>Are you a current student?</label>
                <select value={isStudent} onChange={(e) => setIsStudent(e.target.value)} className={input}>
                  <option value="">Select…</option><option value="Yes">Yes</option><option value="No">No</option>
                </select>
              </div>
              {isStudent === "Yes" && (
                <>
                  <div><label className={label}>College / University</label><input value={college} onChange={(e) => setCollege(e.target.value)} className={input} /></div>
                  <div><label className={label}>Student ID</label><input value={studentId} onChange={(e) => setStudentId(e.target.value)} className={input} /></div>
                </>
              )}
              <p className="sm:col-span-2 text-[11.5px] text-faint">
                Your photo and ID document stay in the onboarding email — they are not stored here.
              </p>

              <div className="sm:col-span-2 mt-1"><div className="section-label">Payout details</div>
                <p className="text-[11.5px] text-muted-foreground mt-1">Where your commission is paid. Add a UPI id <b>or</b> a bank account — this enables instant auto-payout.</p>
              </div>
              <div className="sm:col-span-2"><label className={label}>UPI id</label><input value={pUpi} onChange={(e) => setPUpi(e.target.value)} placeholder="name@okhdfc" className={input} /></div>
              <div><label className={label}>Bank account holder</label><input value={pAccName} onChange={(e) => setPAccName(e.target.value)} className={input} /></div>
              <div><label className={label}>Account number</label><input value={pAccNo} onChange={(e) => setPAccNo(e.target.value)} className={input} /></div>
              <div><label className={label}>IFSC</label><input value={pIfsc} onChange={(e) => setPIfsc(e.target.value.toUpperCase())} className={input} /></div>
              <div><label className={label}>PAN (optional)</label><input value={pPan} onChange={(e) => setPPan(e.target.value.toUpperCase())} className={input} /></div>
            </>
          )}
          <div className="sm:col-span-2 flex items-center gap-3">
            <button type="submit" disabled={busy} className={GOLD + " px-5 py-2.5 text-[13px] disabled:opacity-60"}>{busy ? "Saving…" : "Save profile"}</button>
            {msg && <span className={"text-[12.5px] " + (msg.ok ? "text-[#1e7a44]" : "text-[#b3341f]")}>{msg.t}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
