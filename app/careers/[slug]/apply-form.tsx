"use client";

import { useMemo, useRef, useState } from "react";
import {
  type Field, validateAnswer, DEFAULT_ACCEPT, DEFAULT_MAX_MB, TOTAL_UPLOAD_MB,
} from "@/lib/careers-fields";

const control =
  "w-full neu-inset rounded-xl px-3.5 py-2.5 text-base text-foreground placeholder:text-faint outline-none focus:ring-2 focus:ring-gold/25";
const labelCls = "block text-[0.8rem] font-[560] text-muted-foreground mb-1.5";

type Upload = { name: string; b64: string; size: number };

function readAsBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("Could not read that file"));
    r.readAsDataURL(file);
  });
}

export default function ApplyForm({ slug, title, fields, disabled, general }:
  { slug: string; title: string; fields: Field[]; disabled?: boolean; general?: boolean }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, Upload>>({});
  const [consent, setConsent] = useState(false);
  const [company, setCompany] = useState(""); // honeypot
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const set = (id: string, v: string) => setAnswers((a) => ({ ...a, [id]: v }));
  const totalMb = useMemo(
    () => Object.values(files).reduce((n, f) => n + f.size, 0) / 1024 / 1024,
    [files],
  );

  async function pickFile(f: Field, e: React.ChangeEvent<HTMLInputElement>) {
    setErr("");
    const file = e.target.files?.[0];
    if (!file) { setFiles((s) => { const n = { ...s }; delete n[f.id]; return n; }); return; }
    const accept = f.accept?.length ? f.accept : DEFAULT_ACCEPT;
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    const capMb = f.maxMb || DEFAULT_MAX_MB;
    if (!accept.includes(ext)) {
      setErr(`${f.label}: please attach ${accept.join(", ")}.`);
      e.target.value = ""; return;
    }
    if (file.size > capMb * 1024 * 1024) {
      setErr(`${f.label}: that file is over ${capMb} MB.`);
      e.target.value = ""; return;
    }
    setFiles((s) => ({ ...s, [f.id]: { name: file.name, b64: "", size: file.size } }));
    const b64 = await readAsBase64(file);
    setFiles((s) => ({ ...s, [f.id]: { name: file.name, b64, size: file.size } }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    // In the owner's preview the form is only there to be looked at.
    if (disabled) { setErr("This is a preview — publish the role to accept applications."); return; }

    // Same rules the server applies, so problems surface before anything is uploaded.
    for (const f of fields) {
      if (f.type === "file") {
        if (f.required && !files[f.id]) { setErr(`${f.label} is required.`); return; }
        continue;
      }
      const problem = validateAnswer(f, answers[f.id] ?? "");
      if (problem) { setErr(problem); return; }
    }
    if (totalMb > TOTAL_UPLOAD_MB) { setErr(`Your attachments come to ${totalMb.toFixed(1)} MB — the limit is ${TOTAL_UPLOAD_MB} MB.`); return; }
    if (!consent) { setErr("Please tick the consent box so we can process your application."); return; }

    setState("busy");
    try {
      const r = await fetch("/api/careers/apply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug, general: !!general, consent, company_website: company, answers,
          files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, { name: v.name, b64: v.b64 }])),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || "Could not submit your application.");
      setState("done");
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div className="card-lux rounded-3xl p-8 sm:p-10 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl neu-chip text-gold" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </div>
        <h2 className="font-serif text-[1.3rem] font-[600]">Application sent</h2>
        <p className="mx-auto mt-2 max-w-[46ch] text-[0.95rem] leading-relaxed text-muted-foreground">
          Thanks — we&rsquo;ve got everything for <strong className="text-foreground">{title}</strong> and sent a
          confirmation to your email. We&rsquo;ll be in touch if there&rsquo;s a good fit.
        </p>
        <a href="/careers" className="mt-6 inline-block text-[0.9rem] font-[560] text-gold hover:underline">← See other roles</a>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={submit} className="card-lux rounded-3xl p-6 sm:p-9 scroll-mt-28" noValidate>
      <h2 className="font-serif text-[1.3rem] font-[600]">{general ? "Send an open application" : "Apply for this role"}</h2>
      <p className="mt-1.5 text-[0.9rem] text-muted-foreground">Everything marked * is required.</p>

      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const id = `ap-${f.id}`;
          const star = f.required ? " *" : "";
          const wide = f.half ? "" : "sm:col-span-2";
          const common = { id, className: control, value: answers[f.id] ?? "", onChange: (e: any) => set(f.id, e.target.value) };

          return (
            <div key={f.id} className={wide}>
              {f.type !== "checkbox" && <label className={labelCls} htmlFor={id}>{f.label}{star}</label>}

              {f.type === "textarea" && (
                <>
                  <textarea {...common} rows={4} maxLength={f.max || 1500} placeholder={f.placeholder} className={control + " resize-y"} />
                  <p className="mt-1 text-[0.72rem] text-faint">{(answers[f.id] ?? "").length}/{f.max || 1500}</p>
                </>
              )}

              {f.type === "select" && (
                <select {...common}>
                  <option value="">Select…</option>
                  {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              )}

              {f.type === "file" && (
                <>
                  <input
                    id={id} type="file" accept={(f.accept?.length ? f.accept : DEFAULT_ACCEPT).join(",")}
                    onChange={(e) => pickFile(f, e)}
                    className="w-full text-[0.9rem] text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-foreground file:px-4 file:py-2 file:text-[0.82rem] file:font-[560] file:text-background hover:file:opacity-90"
                  />
                  {files[f.id] && (
                    <p className="mt-1.5 text-[0.8rem] text-muted-foreground">
                      {files[f.id].name} · {(files[f.id].size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  )}
                </>
              )}

              {f.type === "checkbox" && (
                <label className="flex cursor-pointer items-start gap-2.5 text-[0.9rem] leading-relaxed text-muted-foreground">
                  <input
                    id={id} type="checkbox" className="mt-0.5 accent-[#c8a24a]"
                    checked={answers[f.id] === "Yes"}
                    onChange={(e) => set(f.id, e.target.checked ? "Yes" : "")}
                  />
                  <span>{f.label}{star}</span>
                </label>
              )}

              {!["textarea", "select", "file", "checkbox"].includes(f.type) && (
                <input
                  {...common}
                  type={f.type === "email" ? "email" : f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "phone" ? "tel" : "text"}
                  inputMode={f.type === "phone" ? "tel" : undefined}
                  maxLength={f.max || undefined}
                  placeholder={f.placeholder}
                  autoComplete={f.id === "name" ? "name" : f.id === "email" ? "email" : f.type === "phone" ? "tel" : undefined}
                />
              )}

              {f.help && <p className="mt-1 text-[0.74rem] text-faint">{f.help}</p>}
            </div>
          );
        })}
      </div>

      {/* Honeypot — off-screen, unreachable by keyboard, ignored by screen readers. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="company_website">Company website</label>
        <input id="company_website" tabIndex={-1} autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} />
      </div>

      <label className="mt-6 flex cursor-pointer items-start gap-2.5 text-[0.86rem] leading-relaxed text-muted-foreground">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[#c8a24a]" />
        <span>
          I agree that Avloryn Labs may use the details and files I&rsquo;ve shared to consider me for this role.
          See the <a href="/privacy" className="text-foreground underline decoration-border-strong underline-offset-4">privacy policy</a>.
        </span>
      </label>

      {err && <p role="alert" className="mt-4 rounded-xl border border-[#f3cfc6] bg-[#fdeeea] px-3.5 py-2.5 text-[0.86rem] text-[#b3341f]">{err}</p>}

      <button type="submit" disabled={state === "busy"} className="btn-gold mt-6 rounded-full px-7 py-3 text-[0.92rem] font-[600] disabled:opacity-60">
        {state === "busy" ? "Sending…" : "Send application"}
      </button>
      <p className="mt-3 text-[0.78rem] text-faint">
        Your application goes straight to our team by email — we don&rsquo;t store it on this website.
      </p>
    </form>
  );
}
