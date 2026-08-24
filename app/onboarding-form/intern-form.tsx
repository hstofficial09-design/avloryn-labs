"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { LogoMark } from "@/components/ui/logo";
import { internshipAgreement, ndaAgreement, parseTermsToContent, withSensitiveClause, ROLE_LABEL, type InternData } from "@/lib/intern-docs";

type FilePayload = { kind: string; b64: string } | undefined;

/** A role as the owner configured it in /portal/onboarding (served by /api/onboarding-form/config). */
type RoleOpt = {
  value: string; label: string; emp_type?: string;
  paid?: boolean; salary?: number | null; salary_period?: string | null;
  /** Owner-edited agreement text; null = use the built-in default. */
  terms?: string | null;
  /** Role handles sensitive data — the NDA gains an extra clause. */
  sensitive?: boolean;
  /** "2" fixes the length, "3,6" offers a choice, blank = the standard options. */
  duration?: string | null;
};

const ID_TYPES = ["PAN card", "College / Student ID", "Driving Licence", "Voter ID", "Passport"];

/** A kind of person who can register, with its OWN form and its own word for its documents. */
type RegKind = {
  key: string; label: string;
  /** "Internship", "Employment", "Consulting" — used wherever the documents name themselves. */
  noun: string;
  fields: Record<string, { visible?: boolean; required?: boolean }>;
  custom: { label: string; type: string; required: boolean }[];
};

function fileToDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// Compress images to <=1000px JPEG; PDFs pass through as base64.
async function processFile(file: File): Promise<FilePayload> {
  if (!file) return undefined;
  if (file.type === "application/pdf") {
    return { kind: "pdf", b64: await fileToDataURL(file) };
  }
  try {
    const url = await fileToDataURL(file);
    const img = document.createElement("img");
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = url;
    });
    const max = 1000;
    let { width: w, height: h } = img;
    const scale = Math.min(max / w, max / h, 1);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no ctx");
    ctx.drawImage(img, 0, 0, w, h);
    return { kind: "jpg", b64: canvas.toDataURL("image/jpeg", 0.82) };
  } catch {
    // fallback (e.g. HEIC that canvas can't decode) — send raw
    return { kind: file.type.includes("png") ? "png" : "jpg", b64: await fileToDataURL(file) };
  }
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function InternForm() {
  const [f, setF] = useState({
    regType: "intern",
    fullName: "", dob: "", mobile: "", email: "", address: "",
    role: "M&C", startDate: "", duration: "3",
    idType: "PAN card", idNumber: "",
    isStudent: null as boolean | null, collegeName: "", studentId: "",
  });
  // Roles + field settings come from the owner's Onboarding Form settings (fallback to built-in).
  // `terms` is the owner's edited agreement for that role — the SAME text the PDF is built from.
  const [roleOpts, setRoleOpts] = useState<RoleOpt[]>([
    { value: "M&C", label: ROLE_LABEL["M&C"] }, { value: "P&R", label: ROLE_LABEL["P&R"] }, { value: "HR", label: "HR Intern" },
  ]);
  const [fieldsCfg, setFieldsCfg] = useState<Record<string, { visible: boolean; required: boolean }>>({});
  const [customQ, setCustomQ] = useState<{ label: string; type: string; required: boolean }[]>([]);
  const [customAns, setCustomAns] = useState<Record<string, string>>({});
  // The owner can rewrite the NDA; null = the standard one.
  const [ndaText, setNdaText] = useState<string | null>(null);
  // "I am registering as", as the owner configured it. Seeded with Intern so the form is usable
  // for the moment before the config lands, and replaced the instant it does.
  const [regTypes, setRegTypes] = useState<RegKind[]>([{ key: "intern", label: "Intern", noun: "Internship", fields: {}, custom: [] }]);
  useEffect(() => {
    fetch("/api/onboarding-form/config").then((r) => r.json()).then((d) => {
      if (Array.isArray(d.roles) && d.roles.length) {
        setRoleOpts(d.roles);
        setF((cur) => (d.roles.some((r: any) => r.value === cur.role) ? cur : { ...cur, role: d.roles[0].value }));
      }
      if (Array.isArray(d.regTypes) && d.regTypes.length) {
        setRegTypes(d.regTypes);
        // Keep whatever is selected if it still exists; otherwise fall to the first offered kind,
        // so a kind the owner turns off can never leave someone submitting a dead value.
        setF((cur) => (d.regTypes.some((t: any) => t.key === cur.regType) ? cur : { ...cur, regType: d.regTypes[0].key }));
      }
      // Fields and questions belong to the kind now; the shared ones are only the seed used
      // before a kind is chosen (and the server already folded them in as the fallback).
      if (d.fields && typeof d.fields === "object") setFieldsCfg(d.fields);
      if (Array.isArray(d.custom)) setCustomQ(d.custom.filter((q: any) => q?.label));
      if (typeof d.nda === "string" && d.nda.trim()) setNdaText(d.nda);
    }).catch(() => {});
  }, []);
  /** The kind being registered, with its own form and wording. */
  const kind = useMemo(
    () => regTypes.find((t) => t.key === f.regType) || regTypes[0] || null,
    [regTypes, f.regType]);
  /** What this kind's documents are called — "Internship", "Employment", "Consulting". */
  const NOUN = kind?.noun || "Internship";
  // Whatever the chosen kind asks for, falling back to the shared set before one is chosen.
  const effFields = kind?.fields && Object.keys(kind.fields).length ? kind.fields : fieldsCfg;
  const effCustom = kind?.custom?.length ? kind.custom : customQ;

  const fVis = (k: string) => effFields[k]?.visible !== false;      // default shown
  const fReq = (k: string) => effFields[k]?.required !== false;     // default required (owner can relax)
  const star = (k: string) => (fReq(k) ? " *" : "");
  const [photo, setPhoto] = useState<FilePayload>();
  const [idDoc, setIdDoc] = useState<FilePayload>();
  const [studentDoc, setStudentDoc] = useState<FilePayload>();
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const [err, setErr] = useState("");

  const up = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  // ---- signature pad ----
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [signed, setSigned] = useState(false);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
    };
    const down = (e: PointerEvent) => { drawing.current = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = (e: PointerEvent) => { if (!drawing.current) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); setSigned(true); };
    const upEv = () => { drawing.current = false; };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    window.addEventListener("pointerup", upEv);
    return () => { c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); window.removeEventListener("pointerup", upEv); };
  }, []);
  const clearSig = () => {
    const c = canvasRef.current;
    if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setSigned(false);
  };

  // Prefill start date to today (editable) — set on client to avoid hydration mismatch.
  useEffect(() => {
    const t = new Date();
    const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    setF((s) => (s.startDate ? s : { ...s, startDate: iso }));
  }, []);

  // The selected role's owner-configured settings (terms, pay) — drives the agreement below.
  /**
   * Only the roles that belong to the kind being registered.
   *
   * Every role carries the kind it is for (its "Type" in /portal/onboarding). Showing all of them
   * regardless meant someone registering as an Employee could pick an intern track and be sent an
   * internship agreement — the wrong document, signed.
   *
   * A role with no kind recorded is shown to everyone rather than hidden from everyone: an owner
   * who has not set them all up yet must not end up with an empty list.
   */
  const rolesForKind = useMemo(
    () => roleOpts.filter((r) => !r.emp_type || r.emp_type === f.regType),
    [roleOpts, f.regType]);
  const roleCfg = useMemo(() => roleOpts.find((r) => r.value === f.role) || null, [roleOpts, f.role]);

  /**
   * How long this role runs, decided by the role itself.
   *
   * HR's two months used to be written into the form as a special case — a rule about one role
   * living in the wrong place, where no other role could ever have one. It comes from the role's
   * own setting now: one value fixes the length, several offer a choice, blank keeps the standard
   * options.
   */
  const durationOpts = useMemo(() => {
    const set = String(roleCfg?.duration || "").split(",").map((x) => x.trim()).filter(Boolean);
    return set.length ? set : ["2", "3", "6"];
  }, [roleCfg]);
  // Picking a role whose length is fixed must not leave the previous role's answer behind.
  useEffect(() => {
    if (!durationOpts.includes(f.duration)) up("duration", durationOpts[0]);
  }, [durationOpts]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Switching kind must not leave the previous kind's role selected underneath.
  useEffect(() => {
    if (!rolesForKind.length) return;
    if (!rolesForKind.some((r) => r.value === f.role)) up("role", rolesForKind[0].value);
  }, [rolesForKind]);   // eslint-disable-line react-hooks/exhaustive-deps

  const previewData: InternData = useMemo(() => ({
    ...f, role: f.role, startDate: fmtDate(f.startDate) || "[Start Date]",
    duration: f.duration, idType: f.idType, isStudent: !!f.isStudent,
    fullName: f.fullName || "[Intern Name]", signedAt: "",
    // Mirror what the PDF builder does with the role's pay settings, so the text matches.
    paid: !!roleCfg?.paid, salary: roleCfg?.salary ?? null, salaryPeriod: roleCfg?.salary_period ?? null,
    sensitive: !!roleCfg?.sensitive,
  }), [f, roleCfg]);

  // Read the SAME agreement the PDF will contain: the owner's edited terms for this role if
  // they set any, else the built-in default. Mirrors app/api/onboarding-form/route.ts.
  const ia = useMemo(
    () => (roleCfg?.terms && roleCfg.terms.trim()
      ? parseTermsToContent(roleCfg.terms, previewData)
      : internshipAgreement(previewData)),
    [roleCfg, previewData],
  );
  // One shared NDA — the owner's rewrite when they've made one, else the standard document.
  // A role marked "handles sensitive data" adds one extra clause. Mirrors the PDF builder.
  const nda = useMemo(() => {
    if (!ndaText) return ndaAgreement(previewData);
    const base = parseTermsToContent(ndaText, previewData);
    return previewData.sensitive ? withSensitiveClause(base) : base;
  }, [ndaText, previewData]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    // Only the three that cannot be switched off are unconditional here; everything else asks the
    // kind's own settings, so turning a field off actually lets someone finish without it.
    if (!f.fullName || !f.email) { setErr("Please fill all required fields."); return; }
    if (fVis("dob") && fReq("dob") && !f.dob) { setErr("Please add your date of birth."); return; }
    if (fVis("startDate") && fReq("startDate") && !f.startDate) { setErr("Please add your start date."); return; }
    if (fVis("mobile") && fReq("mobile") && !f.mobile) { setErr("Please add your mobile number."); return; }
    if (fVis("address") && fReq("address") && !f.address) { setErr("Please add your address."); return; }
    for (const q of effCustom) if (q.required && !(customAns[q.label] || "").trim()) { setErr(`Please answer: ${q.label}`); return; }
    if (fVis("photo") && fReq("photo") && !photo) { setErr("Please upload your photo."); return; }
    if (fVis("govId") && fReq("govId") && !idDoc) { setErr("Please upload a photo ID."); return; }
    if (fVis("student")) {
      if (f.isStudent === null) { setErr("Please tell us whether you are a current student."); return; }
      if (f.isStudent && !studentDoc) { setErr("Please upload your student ID."); return; }
    }
    if (!signed) { setErr("Please add your signature."); return; }
    if (!consent) { setErr("Please accept the terms."); return; }
    setStatus("busy");
    try {
      const signature = canvasRef.current!.toDataURL("image/png");
      const res = await fetch("/api/onboarding-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: { ...f, startDate: fmtDate(f.startDate), dob: fmtDate(f.dob) },
          isStudent: f.isStudent, consent, signature,
          custom: effCustom.map((q) => ({ q: q.label, a: (customAns[q.label] || "").trim() })).filter((x) => x.a),
          files: { photo, idDoc, studentDoc: f.isStudent ? studentDoc : undefined },
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Submission failed.");
      setStatus("ok");
    } catch (e) {
      setStatus("err");
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  const inputCls = "w-full rounded-xl neu-inset text-foreground placeholder:text-faint px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gold/25 transition-shadow";
  const labelCls = "block text-[13px] font-medium mb-1.5 text-foreground/80";
  const fileCls = "w-full text-sm text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-gold-soft/60 file:px-3.5 file:py-1.5 file:text-sm file:font-[560] file:text-[#3a2e0c]";

  if (status === "ok") {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <LogoMark size={36} className="mx-auto mb-6" />
        <h1 className="text-2xl font-semibold mb-3">Welcome aboard 🌱</h1>
        <p className="text-muted-foreground">Your details are in. We&apos;ve emailed your <b>Joining Letter</b> and signed agreements to <b>{f.email}</b>. See you inside — Team Avloryn Labs.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 sm:py-16">
      {/* header */}
      <div className="mb-8 flex items-center gap-3">
        <LogoMark size={30} />
        <div>
          <div className="font-serif text-[1.15rem] font-[600] leading-none">Avloryn <span className="text-gold">Labs</span></div>
          <div className="section-label mt-1.5">Onboarding</div>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
        Welcome! You&apos;ve been selected to join <b>Avloryn Labs</b> — the team building <b>LivoDraft</b>.
        Please complete your details below and sign your agreements to get started. This page is for selected candidates only.
      </p>

      <form onSubmit={submit} className="space-y-8">
        {/* hidden honeypot */}
        <input type="text" name="company" tabIndex={-1} autoComplete="off" className="hidden" onChange={() => {}} />

        {/* Registration type */}
        <div className="card-lux rounded-2xl p-5">
          <div className="text-[13px] font-medium mb-2.5 text-foreground/80">I am registering as</div>
          {/* Whatever the owner has set up. This was two hard-coded radios with Employee greyed
              out as "coming soon" — which is why it stayed that way. */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {regTypes.map((t) => (
              <label key={t.key} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="regType" checked={f.regType === t.key} onChange={() => up("regType", t.key)} />
                {t.label}
              </label>
            ))}
          </div>
        </div>

        {/* Personal */}
        <Section title="Your details">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full name *"><input className={inputCls} value={f.fullName} onChange={(e) => up("fullName", e.target.value)} /></Field>
            {fVis("dob") && <Field label={"Date of birth" + star("dob")}><input type="date" className={inputCls} value={f.dob} onChange={(e) => up("dob", e.target.value)} /></Field>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fVis("mobile") && <Field label={"Mobile" + star("mobile")}><input className={inputCls} value={f.mobile} onChange={(e) => up("mobile", e.target.value)} /></Field>}
            <Field label="Email *"><input type="email" className={inputCls} value={f.email} onChange={(e) => up("email", e.target.value)} /></Field>
          </div>
          {fVis("address") && <Field label={"Address" + star("address")}><textarea className={inputCls} rows={2} value={f.address} onChange={(e) => up("address", e.target.value)} /></Field>}
          {fVis("photo") && <Field label={"Photo (passport-style)" + star("photo")}><input type="file" accept="image/*,application/pdf" className={fileCls} onChange={async (e) => setPhoto(await processFile(e.target.files![0]))} /></Field>}
        </Section>

        {/* Identity */}
        {fVis("govId") && (
        <Section title="Identity">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={"Photo ID type" + star("govId")}>
              <select className={inputCls} value={f.idType} onChange={(e) => up("idType", e.target.value)}>
                {ID_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="ID number (optional)"><input className={inputCls} value={f.idNumber} onChange={(e) => up("idNumber", e.target.value)} /></Field>
          </div>
          <Field label={"Upload photo ID" + (fReq("govId") ? " *" : "") + " (JPG / PNG / PDF)"}><input type="file" accept="image/*,application/pdf" className={fileCls} onChange={async (e) => setIdDoc(await processFile(e.target.files![0]))} /></Field>
        </Section>
        )}

        {/* Student */}
        {fVis("student") && (
        <Section title="Are you a current student?">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="isStudent" checked={f.isStudent === true} onChange={() => up("isStudent", true)} /> Yes, I&apos;m currently studying
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="isStudent" checked={f.isStudent === false} onChange={() => up("isStudent", false)} /> No
            </label>
          </div>
          {f.isStudent === true && (
            <div className="mt-3 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="College / University"><input className={inputCls} value={f.collegeName} onChange={(e) => up("collegeName", e.target.value)} /></Field>
                <Field label="Student ID number"><input className={inputCls} value={f.studentId} onChange={(e) => up("studentId", e.target.value)} /></Field>
              </div>
              <Field label="Upload student ID"><input type="file" accept="image/*,application/pdf" className={fileCls} onChange={async (e) => setStudentDoc(await processFile(e.target.files![0]))} /></Field>
            </div>
          )}
        </Section>
        )}

        {/* Custom questions from the owner's Onboarding Form settings */}
        {effCustom.length > 0 && (
          <Section title="A few more questions">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {effCustom.map((q, i) => (
                <Field key={i} label={q.label + (q.required ? " *" : "")}>
                  <input type={q.type === "date" ? "date" : q.type === "number" ? "number" : "text"} className={inputCls} value={customAns[q.label] || ""} onChange={(e) => setCustomAns((a) => ({ ...a, [q.label]: e.target.value }))} />
                </Field>
              ))}
            </div>
          </Section>
        )}

        {/* Internship */}
        {/* Titled after the kind — this section said "Internship" to an employee. */}
        <Section title={NOUN}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* A kind that has no tracks — a network partner, say — can turn this off entirely
                rather than showing an empty list nobody can get past. */}
            {fVis("role") && (
              <Field label={"Track" + star("role")}>
                <select className={inputCls} value={f.role} onChange={(e) => up("role", e.target.value)}>
                  {rolesForKind.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {!rolesForKind.length && (
                  <div className="text-[11.5px] text-[#b3341f] mt-1">
                    No tracks are set up for this yet — please pick another option above.
                  </div>
                )}
              </Field>
            )}
            {fVis("startDate") && <Field label={"Start date" + star("startDate")}><input type="date" className={inputCls} value={f.startDate} onChange={(e) => up("startDate", e.target.value)} /></Field>}
            {/* Only what this role actually offers. A role with a single length shows it and
                nothing else, rather than inviting a choice that is not really there. */}
            {fVis("duration") && (
              <Field label="Duration *">
                {durationOpts.length === 1 ? (
                  <input readOnly value={`${durationOpts[0]} months`} className={inputCls + " opacity-70"} />
                ) : (
                  <select className={inputCls} value={f.duration} onChange={(e) => up("duration", e.target.value)}>
                    {durationOpts.map((d) => <option key={d} value={d}>{d} months</option>)}
                  </select>
                )}
              </Field>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Your start date is prefilled to today — change it if you&apos;re joining later. </p>
        </Section>

        {/* Agreements */}
        <Section title="Agreements">
          <p className="text-xs text-muted-foreground mb-2">Please read the {NOUN} Agreement and NDA below, then sign once — your signature applies to both.</p>
          <div className="max-h-64 overflow-y-auto rounded-xl neu-inset p-4 text-[12px] leading-relaxed text-foreground/80 space-y-3">
            <AgreementText title={ia.title} intro={ia.intro} clauses={ia.clauses} />
            <AgreementText title={nda.title} intro={nda.intro} clauses={nda.clauses} />
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <label className={labelCls + " mb-0"}>Signature *</label>
              <button type="button" onClick={clearSig} className="text-xs text-muted-foreground underline">Clear</button>
            </div>
            <canvas ref={canvasRef} width={520} height={140} className="w-full rounded-xl ring-1 ring-border bg-white touch-none cursor-crosshair" />
            <p className="text-[11px] text-muted-foreground mt-1">Draw your signature above (mouse / finger).</p>
          </div>

          <label className="mt-4 flex items-start gap-2 text-[13px]">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            <span>I confirm the information provided is correct, and I accept the {NOUN} Agreement and NDA. I consent to Avloryn Labs securely storing these details for records and verification.</span>
          </label>
        </Section>

        {err && <p className="text-sm text-red-600">{err}</p>}
        <button type="submit" disabled={status === "busy"} className="w-full btn-gold rounded-full px-4 py-3.5 text-sm font-[560] transition disabled:opacity-60">
          {status === "busy" ? "Submitting…" : "Submit & Sign"}
        </button>
        <p className="text-[11px] text-muted-foreground text-center">On submit, you&apos;ll receive your Joining Letter and signed agreements by email.</p>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-serif text-[15px] font-[600] mb-3 pb-2 border-b border-border">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[13px] font-medium mb-1.5 text-foreground/80">{label}</label>
      {children}
    </div>
  );
}
function AgreementText({ title, intro, clauses }: { title: string; intro: string; clauses: { h?: string; t: string }[] }) {
  return (
    <div>
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-1">{intro}</p>
      {clauses.map((c, i) => (
        <p key={i} className="mt-1.5">{c.h && <b>{c.h}. </b>}{c.t}</p>
      ))}
    </div>
  );
}
