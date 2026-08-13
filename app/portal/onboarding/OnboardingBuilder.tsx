"use client";
import { useCallback, useEffect, useState } from "react";
import { LogoMark } from "@/components/ui/logo";

type Role = { track: string; commission_enabled: boolean; paid: boolean; salary: number | null; salary_period: string | null; scope: string | null; terms: string | null; sensitive: boolean; default_emp_type: string; defaultTerms?: string; defaultIsCustom?: boolean };
type FieldCfg = { visible: boolean; required: boolean };
type Custom = { label: string; type: string; required: boolean };
type Form = { fields?: Record<string, FieldCfg>; custom?: Custom[] };

const GHOST = "rounded-full bg-card ring-hairline hover:bg-muted text-foreground font-[520] transition-colors";
const GOLD = "btn-gold rounded-full font-[560]";
const card = "card-lux rounded-3xl p-6 sm:p-7";
const input = "w-full text-[14px] neu-inset text-foreground placeholder:text-faint rounded-[12px] px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-gold/25";
const label = "block text-[12px] font-medium text-foreground/70 mb-1.5";
const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
const CORE = ["Full name", "Email", "Date of birth", "Role", "Duration", "Start date"];
const OPTIONAL = [
  { key: "mobile", label: "Mobile number" },
  { key: "address", label: "Address" },
  { key: "govId", label: "Government ID" },
  { key: "student", label: "Student info (college / ID)" },
];

async function api(action: string, body: any) {
  const r = await fetch("/api/portal/onboarding-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Save failed");
  return d;
}

export default function OnboardingBuilder() {
  const [tab, setTab] = useState<"roles" | "fields">("roles");
  const [roles, setRoles] = useState<Role[]>([]);
  const [form, setForm] = useState<Form>({});
  const [nda, setNda] = useState("");
  const [err, setErr] = useState("");
  // FieldsTab seeds its state ONCE from `form`. Rendering it before the config arrives would
  // seed it with defaults, and a save would then overwrite the real settings — so gate on this.
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/portal/onboarding-config"); const d = await r.json();
      setRoles(d.roles || []); setForm(d.form || {}); setNda(d.ndaText || ""); setLoaded(true);
    }
    catch (e) { setErr(msg(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-[840px] mx-auto px-4 sm:px-6 py-8">
      <header className="flex items-center justify-between gap-3 flex-wrap mb-7">
        <div className="flex items-center gap-3">
          <LogoMark size={30} />
          <div><div className="font-serif text-[17px] font-[600] leading-none">Avloryn <span className="text-gold">Labs</span></div><div className="section-label mt-1">Onboarding Form</div></div>
        </div>
        <a href="/portal" className={GHOST + " text-[12.5px] px-3.5 py-1.5"}>← Home</a>
      </header>

      <h1 className="font-serif text-[27px] font-[600] tracking-[-0.01em] mb-1.5">Onboarding Form</h1>
      <p className="text-[13px] text-muted-foreground mb-6 max-w-[60ch]">Control everything new hires see and agree to — roles, pay, form fields, and each role&rsquo;s terms. The NDA is the same standard for every role.</p>

      {err && <div className="text-[13px] text-[#b3341f] bg-[#fdeeea] border border-[#f3cfc6] rounded-xl px-3 py-2 mb-5">{err} <button onClick={() => setErr("")} className="ml-2 underline">dismiss</button></div>}

      <div className="flex gap-2 mb-6">
        {(["roles", "fields"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-2 text-[12.5px] font-[560] capitalize ${tab === t ? "btn-gold" : "neu-chip text-foreground/70"}`}>{t === "roles" ? "Roles & terms" : "Form fields"}</button>
        ))}
      </div>

      {!loaded
        ? <div className="card-lux rounded-3xl p-6 text-[13px] text-muted-foreground">Loading your settings…</div>
        : tab === "roles" ? <RolesTab roles={roles} nda={nda} reload={load} /> : <FieldsTab form={form} reload={load} />}
    </div>
  );
}

/* ─────────── Roles & terms ─────────── */
function RolesTab({ roles, nda, reload }: { roles: Role[]; nda: string; reload: () => void }) {
  const [newRole, setNewRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [showNda, setShowNda] = useState(false);
  async function add(e: React.FormEvent) {
    e.preventDefault(); if (!newRole.trim()) return; setBusy(true);
    try { await api("role", { role: { track: newRole.trim(), commission_enabled: true } }); setNewRole(""); reload(); } finally { setBusy(false); }
  }
  return (
    <div className="grid gap-4">
      <div className={card}>
        <div className="flex items-center justify-between gap-3">
          <div><h3 className="font-serif text-[16px] font-[600]">Standard NDA</h3><p className="text-[12.5px] text-muted-foreground mt-0.5">Same for every role — signed by all hires alongside their role terms.</p></div>
          <button onClick={() => setShowNda((v) => !v)} className={GHOST + " text-[12px] px-3.5 py-1.5 shrink-0"}>{showNda ? "Hide" : "View NDA"}</button>
        </div>
        {showNda && <pre className="mt-4 neu-inset rounded-2xl p-4 text-[12px] leading-relaxed whitespace-pre-wrap font-sans text-foreground/80 max-h-[320px] overflow-y-auto">{nda}</pre>}
      </div>
      {roles.map((r) => <RoleCard key={r.track} role={r} reload={reload} />)}
      <form onSubmit={add} className={card + " flex items-center gap-2 flex-wrap"}>
        <input value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="Add a new role (e.g. Design)" className={input + " sm:max-w-sm"} />
        <button type="submit" disabled={busy} className={GOLD + " px-5 py-2.5 text-[13px]"}>Add role</button>
      </form>
    </div>
  );
}

function RoleCard({ role, reload }: { role: Role; reload: () => void }) {
  // Pre-fill terms with the CURRENT terms so the owner sees + edits what already exists.
  const [r, setR] = useState<Role>({ ...role, terms: role.terms ?? role.defaultTerms ?? "" });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(role.track);
  const [renameErr, setRenameErr] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const [defBusy, setDefBusy] = useState(false);
  const [defOk, setDefOk] = useState(false);
  const set = (k: keyof Role, v: any) => setR((x) => ({ ...x, [k]: v }));
  async function doRename() {
    const to = newName.trim();
    if (!to || to === role.track) { setRenaming(false); return; }
    setRenameErr("");
    try { await api("role-rename", { from: role.track, to }); reload(); } catch (e: any) { setRenameErr(e?.message || "Could not rename"); }
  }
  async function save() {
    setBusy(true); setSaveErr("");
    // A failed save used to throw silently — the owner saw neither "Saved ✓" nor a reason.
    try { await api("role", { role: r }); setSaved(true); setTimeout(() => setSaved(false), 1500); reload(); }
    catch (e) { setSaveErr(msg(e)); }
    finally { setBusy(false); }
  }
  // Make the text currently in the box this role's default, so "Reset to default" restores
  // THIS agreement instead of the built-in template — an accidental reset can't lose anything.
  async function setAsDefault() {
    setDefBusy(true); setSaveErr("");
    try { await api("role-default", { track: r.track, terms: r.terms }); setDefOk(true); setTimeout(() => setDefOk(false), 2000); reload(); }
    catch (e) { setSaveErr(msg(e)); }
    finally { setDefBusy(false); }
  }
  async function remove() {
    if (!confirm(`Remove the “${r.track}” role? Existing employees keep their role; it just won't be offered on new onboarding.`)) return;
    await api("role-archive", { track: r.track }); reload();
  }
  const pill = (on: boolean) => `rounded-full px-3 py-1 text-[11.5px] font-[600] ${on ? "btn-gold" : "bg-card ring-hairline text-muted-foreground"}`;

  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        {renaming ? (
          <div className="flex items-center gap-2 flex-wrap">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus className="neu-inset rounded-lg px-3 py-1.5 text-[15px] font-[600]" />
            <button onClick={doRename} className="btn-gold rounded-full px-3.5 py-1.5 text-[12px] font-[560]">Save name</button>
            <button onClick={() => { setRenaming(false); setNewName(role.track); setRenameErr(""); }} className="text-[12px] font-semibold text-muted-foreground hover:underline">Cancel</button>
            {renameErr && <span className="text-[11.5px] text-[#b3341f]">{renameErr}</span>}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="font-serif text-[18px] font-[600]">{r.track}</div>
            <button onClick={() => { setNewName(r.track); setRenaming(true); }} className="text-[11.5px] font-semibold text-gold hover:underline">Rename</button>
          </div>
        )}
        <button onClick={remove} className="text-[12px] font-semibold text-[#b3341f] hover:underline">Remove role</button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div>
          <div className={label}>Commission model</div>
          <div className="flex gap-2">
            <button onClick={() => set("commission_enabled", true)} className={pill(r.commission_enabled)}>Commission ON</button>
            <button onClick={() => set("commission_enabled", false)} className={pill(!r.commission_enabled)}>No commission</button>
          </div>
        </div>
        <div>
          <div className={label}>Type</div>
          <div className="flex gap-2">
            <button onClick={() => set("default_emp_type", "intern")} className={pill(r.default_emp_type === "intern")}>Intern</button>
            <button onClick={() => set("default_emp_type", "employee")} className={pill(r.default_emp_type === "employee")}>Employee</button>
          </div>
        </div>
        <div>
          <div className={label}>Pay</div>
          <div className="flex gap-2 flex-wrap items-center">
            <button onClick={() => set("paid", false)} className={pill(!r.paid)}>Unpaid</button>
            <button onClick={() => set("paid", true)} className={pill(r.paid)}>Paid</button>
            {r.paid && (
              <>
                <input type="number" min={0} value={r.salary ?? ""} onChange={(e) => set("salary", e.target.value ? +e.target.value : null)} placeholder="Salary ₹" className="neu-inset rounded-lg px-2.5 py-1.5 text-[13px] w-[110px]" />
                <select value={r.salary_period || "monthly"} onChange={(e) => set("salary_period", e.target.value)} className="neu-inset rounded-lg px-2.5 py-1.5 text-[13px]">
                  <option value="monthly">/ month</option><option value="yearly">/ year</option>
                </select>
              </>
            )}
          </div>
        </div>
        <label className="flex items-center gap-2 text-[13px] cursor-pointer self-end">
          <input type="checkbox" checked={r.sensitive} onChange={(e) => set("sensitive", e.target.checked)} className="accent-[#c8a24a]" />
          Handles sensitive data <span className="text-faint text-[11.5px]">(extra NDA clause)</span>
        </label>
      </div>

      <div className="mb-3">
        <label className={label}>Responsibilities <span className="text-faint font-normal">(shown in the agreement; blank = standard)</span></label>
        <textarea value={r.scope || ""} onChange={(e) => set("scope", e.target.value)} rows={2} className={input + " resize-none"} placeholder="e.g. Assist with content, campaigns and community…" />
      </div>
      <div className="mb-4">
        <div className="flex items-center justify-between gap-x-4 flex-wrap">
          <label className={label}>Terms &amp; Conditions for this role <span className="text-faint font-normal">(edit freely; [brackets] auto-fill per hire — reset restores {role.defaultIsCustom ? "your saved default" : "the standard template"})</span></label>
          <div className="flex items-center gap-3 mb-1.5">
            <button type="button" onClick={setAsDefault} disabled={defBusy || !(r.terms || "").trim()} className="text-[11.5px] font-semibold text-gold hover:underline disabled:opacity-40 disabled:no-underline">
              {defBusy ? "Saving…" : defOk ? "Saved as default ✓" : "Set current terms as default"}
            </button>
            {role.defaultTerms && <button type="button" onClick={() => set("terms", role.defaultTerms!)} className="text-[11.5px] font-semibold text-muted-foreground hover:underline">Reset to default</button>}
          </div>
        </div>
        <textarea value={r.terms || ""} onChange={(e) => set("terms", e.target.value)} rows={12} className={input + " resize-y font-sans text-[12.5px] leading-relaxed"} />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={save} disabled={busy} className={GOLD + " px-5 py-2.5 text-[13px] disabled:opacity-60"}>{busy ? "Saving…" : "Save role"}</button>
        {saved && <span className="text-[12.5px] text-[#1e7a44]">Saved ✓</span>}
        {saveErr && <span className="text-[12.5px] text-[#b3341f]">{saveErr}</span>}
      </div>
    </div>
  );
}

/* ─────────── Form fields ─────────── */
function FieldsTab({ form, reload }: { form: Form; reload: () => void }) {
  const [fields, setFields] = useState<Record<string, FieldCfg>>(() => {
    const base: Record<string, FieldCfg> = {};
    for (const f of OPTIONAL) base[f.key] = form.fields?.[f.key] || { visible: true, required: true };
    return base;
  });
  const [custom, setCustom] = useState<Custom[]>(form.custom || []);
  const [busy, setBusy] = useState(false); const [saved, setSaved] = useState(false);
  const setField = (k: string, patch: Partial<FieldCfg>) => setFields((f) => ({ ...f, [k]: { ...f[k], ...patch } }));
  const addCustom = () => setCustom((c) => [...c, { label: "", type: "text", required: false }]);
  const updCustom = (i: number, patch: Partial<Custom>) => setCustom((c) => c.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const delCustom = (i: number) => setCustom((c) => c.filter((_, idx) => idx !== i));
  async function save() {
    setBusy(true);
    try { await api("form", { config: { fields, custom: custom.filter((c) => c.label.trim()) } }); setSaved(true); setTimeout(() => setSaved(false), 1500); reload(); } finally { setBusy(false); }
  }
  const pill = (on: boolean) => `rounded-full px-3 py-1 text-[11.5px] font-[600] ${on ? "btn-gold" : "bg-card ring-hairline text-muted-foreground"}`;

  return (
    <div className="grid gap-4">
      <div className={card}>
        <h3 className="font-serif text-[17px] font-[600] mb-1">Always asked</h3>
        <p className="text-[12.5px] text-muted-foreground mb-3">These are required for login and the legal documents — can&rsquo;t be removed.</p>
        <div className="flex gap-2 flex-wrap">{CORE.map((c) => <span key={c} className="neu-chip rounded-full px-3 py-1.5 text-[12px] font-[560]">{c}</span>)}</div>
      </div>

      <div className={card}>
        <h3 className="font-serif text-[17px] font-[600] mb-4">Optional fields</h3>
        <div className="grid gap-2.5">
          {OPTIONAL.map((f) => {
            const cfg = fields[f.key];
            return (
              <div key={f.key} className="flex items-center justify-between gap-3 neu-inset rounded-xl px-3.5 py-2.5 flex-wrap">
                <span className="text-[13px] font-[560]">{f.label}</span>
                <div className="flex gap-2">
                  <button onClick={() => setField(f.key, { visible: !cfg.visible })} className={pill(cfg.visible)}>{cfg.visible ? "Shown" : "Hidden"}</button>
                  <button onClick={() => setField(f.key, { required: !cfg.required })} disabled={!cfg.visible} className={pill(cfg.required) + (cfg.visible ? "" : " opacity-40")}>{cfg.required ? "Required" : "Optional"}</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={card}>
        <h3 className="font-serif text-[17px] font-[600] mb-1">Custom questions</h3>
        <p className="text-[12.5px] text-muted-foreground mb-4">Extra questions for new hires (stored with their record; not part of the legal documents).</p>
        <div className="grid gap-2">
          {custom.map((q, i) => (
            <div key={i} className="flex items-center gap-2 flex-wrap">
              <input value={q.label} onChange={(e) => updCustom(i, { label: e.target.value })} placeholder="Question" className={input + " flex-1 min-w-[180px]"} />
              <select value={q.type} onChange={(e) => updCustom(i, { type: e.target.value })} className="neu-inset rounded-lg px-2.5 py-2 text-[13px]"><option value="text">Text</option><option value="date">Date</option><option value="number">Number</option></select>
              <label className="flex items-center gap-1 text-[12px]"><input type="checkbox" checked={q.required} onChange={(e) => updCustom(i, { required: e.target.checked })} className="accent-[#c8a24a]" />req</label>
              <button onClick={() => delCustom(i)} className="text-[#b3341f] text-[16px] px-1">×</button>
            </div>
          ))}
          <button onClick={addCustom} className={GHOST + " text-[12.5px] px-4 py-2 w-fit"}>+ add question</button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className={GOLD + " px-5 py-2.5 text-[13px] disabled:opacity-60"}>{busy ? "Saving…" : "Save form settings"}</button>
        {saved && <span className="text-[12.5px] text-[#1e7a44]">Saved ✓</span>}
      </div>
    </div>
  );
}
