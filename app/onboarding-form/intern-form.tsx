"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { LogoMark } from "@/components/ui/logo";
import { internshipAgreement, ndaAgreement, ROLE_LABEL, type Role, type InternData } from "@/lib/intern-docs";

type FilePayload = { kind: string; b64: string } | undefined;

const ID_TYPES = ["PAN card", "College / Student ID", "Driving Licence", "Voter ID", "Passport"];

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
    regType: "intern" as "intern" | "employee",
    fullName: "", dob: "", mobile: "", email: "", address: "",
    role: "M&C" as Role, startDate: "", duration: "3",
    idType: "PAN card", idNumber: "",
    isStudent: null as boolean | null, collegeName: "", studentId: "",
  });
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

  const previewData: InternData = useMemo(() => ({
    ...f, role: f.role, startDate: fmtDate(f.startDate) || "[Start Date]",
    duration: f.duration, idType: f.idType, isStudent: !!f.isStudent,
    fullName: f.fullName || "[Intern Name]", signedAt: "",
  }), [f]);
  const ia = internshipAgreement(previewData);
  const nda = ndaAgreement(previewData);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!f.fullName || !f.dob || !f.mobile || !f.email || !f.address || !f.startDate) { setErr("Please fill all required fields."); return; }
    if (!photo) { setErr("Please upload your photo."); return; }
    if (!idDoc) { setErr("Please upload a photo ID."); return; }
    if (f.isStudent === null) { setErr("Please tell us whether you are a current student."); return; }
    if (f.isStudent && !studentDoc) { setErr("Please upload your student ID."); return; }
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
        Welcome! You&apos;ve been selected to intern with <b>Avloryn Labs</b> — the team building <b>LivoDraft</b>.
        Please complete your details below and sign your agreements to get started. This page is for selected candidates only.
      </p>

      <form onSubmit={submit} className="space-y-8">
        {/* hidden honeypot */}
        <input type="text" name="company" tabIndex={-1} autoComplete="off" className="hidden" onChange={() => {}} />

        {/* Registration type */}
        <div className="card-lux rounded-2xl p-5">
          <div className="text-[13px] font-medium mb-2.5 text-foreground/80">I am registering as</div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="regType" checked={f.regType === "intern"} onChange={() => up("regType", "intern")} />
              Intern
            </label>
            <label className="flex items-center gap-2 text-muted-foreground cursor-not-allowed">
              <input type="radio" name="regType" disabled />
              Employee <span className="text-xs">(coming soon)</span>
            </label>
          </div>
        </div>

        {/* Personal */}
        <Section title="Your details">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full name *"><input className={inputCls} value={f.fullName} onChange={(e) => up("fullName", e.target.value)} /></Field>
            <Field label="Date of birth *"><input type="date" className={inputCls} value={f.dob} onChange={(e) => up("dob", e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Mobile *"><input className={inputCls} value={f.mobile} onChange={(e) => up("mobile", e.target.value)} /></Field>
            <Field label="Email *"><input type="email" className={inputCls} value={f.email} onChange={(e) => up("email", e.target.value)} /></Field>
          </div>
          <Field label="Address *"><textarea className={inputCls} rows={2} value={f.address} onChange={(e) => up("address", e.target.value)} /></Field>
          <Field label="Photo (passport-style) *"><input type="file" accept="image/*,application/pdf" className={fileCls} onChange={async (e) => setPhoto(await processFile(e.target.files![0]))} /></Field>
        </Section>

        {/* Identity */}
        <Section title="Identity">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Photo ID type *">
              <select className={inputCls} value={f.idType} onChange={(e) => up("idType", e.target.value)}>
                {ID_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="ID number (optional)"><input className={inputCls} value={f.idNumber} onChange={(e) => up("idNumber", e.target.value)} /></Field>
          </div>
          <Field label="Upload photo ID * (JPG / PNG / PDF)"><input type="file" accept="image/*,application/pdf" className={fileCls} onChange={async (e) => setIdDoc(await processFile(e.target.files![0]))} /></Field>
        </Section>

        {/* Student */}
        <Section title="Are you a current student? *">
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

        {/* Internship */}
        <Section title="Internship">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Track *">
              <select className={inputCls} value={f.role} onChange={(e) => { const r = e.target.value as Role; up("role", r); if (r === "HR") up("duration", "2"); }}>
                <option value="M&C">{ROLE_LABEL["M&C"]}</option>
                <option value="P&R">{ROLE_LABEL["P&R"]}</option>
                <option value="HR">HR Intern</option>
              </select>
            </Field>
            <Field label="Start date *"><input type="date" className={inputCls} value={f.startDate} onChange={(e) => up("startDate", e.target.value)} /></Field>
            <Field label="Duration *">
              <select className={inputCls} value={f.duration} onChange={(e) => up("duration", e.target.value)}>
                <option value="2">2 months</option>
                <option value="3">3 months</option>
                <option value="6">6 months</option>
              </select>
            </Field>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Your start date is prefilled to today — change it if you&apos;re joining later. {f.role === "HR" ? "On successful completion of your internship you'll receive an Internship Completion Certificate." : "Please note: a minimum of 3 months is required to be eligible for the completion certificate."}</p>
        </Section>

        {/* Agreements */}
        <Section title="Agreements">
          <p className="text-xs text-muted-foreground mb-2">Please read the Internship Agreement and NDA below, then sign once — your signature applies to both.</p>
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
            <span>I confirm the information provided is correct, and I accept the Internship Agreement and NDA. I consent to Avloryn Labs securely storing these details for records and verification.</span>
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
