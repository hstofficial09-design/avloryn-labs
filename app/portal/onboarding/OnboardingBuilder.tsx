"use client";
import { useCallback, useEffect, useState } from "react";
import { LogoMark } from "@/components/ui/logo";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { JobDescriptionPreview } from "@/components/careers/jd";

type Role = { track: string; commission_enabled: boolean; paid: boolean; salary: number | null; salary_period: string | null; scope: string | null; terms: string | null; sensitive: boolean; default_emp_type: string; defaultTerms?: string; defaultIsCustom?: boolean;
  joiningText?: string; joiningDefault?: string; joiningIsCustom?: boolean };
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

type RegType = { key: string; label: string; enabled: boolean; sort: number; terms: string | null; inUse?: number; roles?: number };

export default function OnboardingBuilder() {
  const [tab, setTab] = useState<"roles" | "fields">("roles");
  const [roles, setRoles] = useState<Role[]>([]);
  const [regTypes, setRegTypes] = useState<RegType[]>([]);
  const [form, setForm] = useState<Form>({});
  const [nda, setNda] = useState("");
  const [ndaDefault, setNdaDefault] = useState("");
  const [ndaIsCustom, setNdaIsCustom] = useState(false);
  const [sensCl, setSensCl] = useState<{ h?: string; t: string } | null>(null);
  const [err, setErr] = useState("");
  // FieldsTab seeds its state ONCE from `form`. Rendering it before the config arrives would
  // seed it with defaults, and a save would then overwrite the real settings — so gate on this.
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/portal/onboarding-config"); const d = await r.json();
      setRoles(d.roles || []); setRegTypes(d.regTypes || []); setForm(d.form || {}); setNda(d.ndaText || "");
      setNdaDefault(d.ndaDefault || ""); setNdaIsCustom(!!d.ndaIsCustom); setSensCl(d.sensitiveClause || null);
      setLoaded(true);
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
        : tab === "roles" ? <RolesTab roles={roles} regTypes={regTypes} nda={nda} ndaDefault={ndaDefault} ndaIsCustom={ndaIsCustom} sensCl={sensCl} reload={load} /> : <FieldsTab form={form} reload={load} />}
    </div>
  );
}

/* ─────────── Roles & terms ─────────── */
function RolesTab({ roles, regTypes, nda, ndaDefault, ndaIsCustom, sensCl, reload }: { roles: Role[]; regTypes: RegType[]; nda: string; ndaDefault: string; ndaIsCustom: boolean; sensCl: { h?: string; t: string } | null; reload: () => void }) {
  const [newRole, setNewRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [showNda, setShowNda] = useState(false);
  async function add(e: React.FormEvent) {
    e.preventDefault(); if (!newRole.trim()) return; setBusy(true);
    try { await api("role", { role: { track: newRole.trim(), commission_enabled: true } }); setNewRole(""); reload(); } finally { setBusy(false); }
  }
  return (
    <div className="grid gap-4">
      <NdaCard nda={nda} ndaDefault={ndaDefault} ndaIsCustom={ndaIsCustom} sensCl={sensCl} open={showNda} setOpen={setShowNda} reload={reload} />
      <RegTypesCard types={regTypes} reload={reload} />
      {roles.map((r) => <RoleCard key={r.track} role={r} regTypes={regTypes} reload={reload} />)}
      <form onSubmit={add} className={card + " flex items-center gap-2 flex-wrap"}>
        <input value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="Add a new role (e.g. Design)" className={input + " sm:max-w-sm"} />
        <button type="submit" disabled={busy} className={GOLD + " px-5 py-2.5 text-[13px]"}>Add role</button>
      </form>
    </div>
  );
}

function NdaCard({ nda, ndaDefault, ndaIsCustom, sensCl, open, setOpen, reload }:
  { nda: string; ndaDefault: string; ndaIsCustom: boolean; sensCl: { h?: string; t: string } | null; open: boolean; setOpen: (v: boolean) => void; reload: () => void }) {
  const [text, setText] = useState(nda);
  const [busy, setBusy] = useState(false); const [defBusy, setDefBusy] = useState(false);
  const [saved, setSaved] = useState(false); const [defOk, setDefOk] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { setText(nda); }, [nda]);
  async function run(action: string, after: () => void) {
    setErr("");
    try { await api(action, { text }); after(); reload(); } catch (e) { setErr(msg(e)); }
  }
  const save = async () => { setBusy(true); await run("nda", () => { setSaved(true); setTimeout(() => setSaved(false), 1500); }); setBusy(false); };
  const setDefault = async () => { setDefBusy(true); await run("nda-default", () => { setDefOk(true); setTimeout(() => setDefOk(false), 2000); }); setDefBusy(false); };

  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-serif text-[16px] font-[600]">Standard NDA</h3>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">Same for every role — signed by all hires alongside their role terms.</p>
        </div>
        <button onClick={() => setOpen(!open)} className={GHOST + " text-[12px] px-3.5 py-1.5 shrink-0"}>{open ? "Hide" : "Edit NDA"}</button>
      </div>
      {open && (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-x-4 flex-wrap">
            <label className={label}>NDA text <span className="text-faint font-normal">(edit freely; [brackets] auto-fill per hire — reset restores {ndaIsCustom ? "your saved default" : "the standard template"})</span></label>
            <div className="flex items-center gap-3 mb-1.5">
              <button type="button" onClick={setDefault} disabled={defBusy || !text.trim()} className="text-[11.5px] font-semibold text-gold hover:underline disabled:opacity-40 disabled:no-underline">
                {defBusy ? "Saving…" : defOk ? "Saved as default ✓" : "Set current NDA as default"}
              </button>
              {ndaDefault && <button type="button" onClick={() => setText(ndaDefault)} className="text-[11.5px] font-semibold text-muted-foreground hover:underline">Reset to default</button>}
            </div>
          </div>
          <RichTextEditor
            value={text} onChange={setText} rows={14}
            preview={(src) => <JobDescriptionPreview source={src} />}
            hint={<>Select text and use the buttons, or type it: ## Heading · - bullet · 1. numbered · **bold** · *italic* · [text](link). A blank line starts a new clause. The signed PDF renders all of this.</>}
          />
          {sensCl && (
            <div className="mt-3 neu-inset rounded-2xl p-4">
              <div className="text-[12px] font-[600] mb-1">Added automatically: {sensCl.h}</div>
              <p className="text-[11.5px] text-muted-foreground leading-relaxed">{sensCl.t}</p>
              <p className="text-[11px] text-faint mt-2">Appended to this NDA only for roles ticked &ldquo;Handles sensitive data&rdquo;. You don&rsquo;t need to add it here.</p>
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap mt-4">
            <button onClick={save} disabled={busy} className={GOLD + " px-5 py-2.5 text-[13px] disabled:opacity-60"}>{busy ? "Saving…" : "Save NDA"}</button>
            {saved && <span className="text-[12.5px] text-[#1e7a44]">Saved ✓</span>}
            {err && <span className="text-[12.5px] text-[#b3341f]">{err}</span>}
          </div>
        </div>
      )}
    </div>
  );
}


/**
 * The kinds of person who can join — what "I am registering as" offers on the form.
 *
 * This was two radios written into the form, with Employee greyed out as "coming soon", so adding
 * a third meant editing the form, the submit route, the builder and the config API together.
 *
 * Two things are deliberately not editable. The KEY is fixed at creation because it is already
 * written into everyone who joined as that kind, and the dashboards, the documents and the partner
 * rules all read it — renaming it would orphan real people. And removing a kind archives it rather
 * than deleting it, for the same reason: it stops being offered, and still names whoever holds it.
 */
function RegTypesCard({ types, reload }: { types: RegType[]; reload: () => void }) {
  const pill = (on: boolean) => `rounded-full px-3 py-1 text-[11.5px] font-[600] ${on ? "btn-gold" : "bg-card ring-hairline text-muted-foreground"}`;
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  async function save(t: RegType, patch: Partial<RegType>) {
    setBusy(t.key); setErr("");
    try { await api("reg-type", { regType: { ...t, ...patch } }); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(""); }
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const label = adding.trim(); if (!label) return;
    setBusy("new"); setErr("");
    try {
      await api("reg-type", { regType: { label, enabled: true, sort: (types.at(-1)?.sort ?? 0) + 10 } });
      setAdding(""); reload();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not add"); }
    finally { setBusy(""); }
  }
  async function remove(t: RegType) {
    if (!confirm(`Stop offering “${t.label}” on the form?\n\n${t.inUse ? `${t.inUse} person(s) already joined as this — they keep it. ` : ""}You can add it back later.`)) return;
    setBusy(t.key);
    try { await api("reg-type-archive", { key: t.key }); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not remove"); }
    finally { setBusy(""); }
  }

  return (
    <div className={card}>
      <div className="font-serif text-[16px] font-[600]">Who can join</div>
      <p className="text-[12px] text-muted-foreground mt-1 mb-3">
        The options under “I am registering as” on the onboarding form. Network partners are not
        here on purpose — they are added and approved from the network, not this form.
      </p>
      <div className="grid gap-2">
        {types.map((t) => (
          <RegTypeRow key={t.key} t={t} busy={busy === t.key} pill={pill}
            onSave={(patch) => save(t, patch)} onRemove={() => remove(t)} />
        ))}
        {!types.length && <div className="text-[12.5px] text-faint">None yet — add one below.</div>}
      </div>
      <form onSubmit={add} className="flex items-center gap-2 flex-wrap mt-3">
        <input value={adding} onChange={(e) => setAdding(e.target.value)}
          placeholder="Add a kind (e.g. Consultant, Freelancer, Volunteer)" className={input + " sm:max-w-sm"} />
        <button type="submit" disabled={busy === "new"} className={GOLD + " px-5 py-2.5 text-[13px]"}>Add</button>
      </form>
      {err && <div className="text-[12px] text-[#b3341f] mt-2">{err}</div>}
    </div>
  );
}

/**
 * One row, with the name held locally while it is being typed.
 *
 * Saving on every keystroke meant a database write and a full reload per letter — and the database
 * is ~180ms away, so typing or backspacing crawled: several presses before one character appeared.
 * The name is local until you finish (blur or Enter), and only a real change is sent.
 */
function RegTypeRow({ t, busy, pill, onSave, onRemove }: {
  t: RegType; busy: boolean; pill: (on: boolean) => string;
  onSave: (patch: Partial<RegType>) => void; onRemove: () => void;
}) {
  const [label, setLabel] = useState(t.label);
  // Follow an update that came from elsewhere (a reload), but never fight what is being typed.
  useEffect(() => { setLabel(t.label); }, [t.label]);
  const commit = () => { const v = label.trim(); if (v && v !== t.label) onSave({ label: v }); else setLabel(t.label); };
  return (
          <div className="flex items-center gap-2 flex-wrap rounded-xl ring-hairline bg-card px-3 py-2">
            <input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={commit}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                                  if (e.key === "Escape") setLabel(t.label); }}
              className={input + " flex-1 min-w-[160px] !py-1.5"} />
            <span className="text-[11px] text-faint font-mono">{t.key}</span>
            {!!t.inUse && <span className="text-[11px] text-faint">{t.inUse} joined</span>}
            {/* Offered on the form but with no role to pick — the person gets an empty list and
                cannot finish. Said here, where it can be fixed. */}
            {t.enabled && !t.roles && (
              <span className="text-[11px] font-[600] text-[#b3341f]" title="Set a role's Type to this below, or hide this kind">
                no roles yet
              </span>
            )}
            <button onClick={() => onSave({ enabled: !t.enabled })} disabled={busy}
              className={pill(t.enabled) + " !text-[11.5px]"}>{t.enabled ? "On the form" : "Hidden"}</button>
            <button onClick={onRemove} disabled={busy}
              className="text-[11.5px] text-[#b3341f] px-2 py-1 rounded-lg hover:bg-[#b3341f]/8">Remove</button>
          </div>
  );
}

function RoleCard({ role, regTypes, reload }: { role: Role; regTypes: RegType[]; reload: () => void }) {
  // Pre-fill terms with the CURRENT terms so the owner sees + edits what already exists.
  const [r, setR] = useState<Role>({ ...role, terms: role.terms ?? role.defaultTerms ?? "" });
  // The joining letter is saved on its own action, so it is held apart from the rest of the form.
  const [joining, setJoining] = useState<string>(role.joiningText ?? "");
  const [jBusy, setJBusy] = useState(""); const [jOk, setJOk] = useState("");
  async function saveJoining(alsoDefault = false) {
    setJBusy(alsoDefault ? "def" : "save"); setJOk("");
    try {
      await api(alsoDefault ? "joining-default" : "joining", { track: r.track, text: joining });
      setJOk(alsoDefault ? "Saved as default ✓" : "Saved ✓"); setTimeout(() => setJOk(""), 2000); reload();
    } finally { setJBusy(""); }
  }
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
          {/* Every kind the owner has set up, not the two that used to be written in here. */}
          <div className="flex gap-2 flex-wrap">
            {(regTypes.length ? regTypes : [{ key: "intern", label: "Intern" } as RegType]).map((t) => (
              <button key={t.key} onClick={() => set("default_emp_type", t.key)}
                className={pill(r.default_emp_type === t.key)}>{t.label}</button>
            ))}
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
      {/* Each role gets its own joining letter. It used to come from one fixed template that said
          "Internship Joining Letter" and "Unpaid, deliverable-based" whoever was joining, so an
          Employee was sent an intern's letter. */}
      <div className="mb-4">
        <div className="flex items-center justify-between gap-x-4 flex-wrap">
          <label className={label}>Joining letter for this role <span className="text-faint font-normal">([brackets] auto-fill per hire — first line is the title, lines starting with • become the bullet list)</span></label>
          <div className="flex items-center gap-3 mb-1.5">
            <button type="button" onClick={() => saveJoining(false)} disabled={!!jBusy}
              className="text-[11.5px] font-semibold text-gold hover:underline disabled:opacity-40 disabled:no-underline">
              {jBusy === "save" ? "Saving…" : jOk === "Saved ✓" ? jOk : "Save letter"}
            </button>
            <button type="button" onClick={() => saveJoining(true)} disabled={!!jBusy || !joining.trim()}
              className="text-[11.5px] font-semibold text-gold hover:underline disabled:opacity-40 disabled:no-underline">
              {jBusy === "def" ? "Saving…" : jOk === "Saved as default ✓" ? jOk : "Set as default"}
            </button>
            {role.joiningDefault && (
              <button type="button" onClick={() => setJoining(role.joiningDefault!)}
                className="text-[11.5px] font-semibold text-muted-foreground hover:underline">Reset to default</button>
            )}
          </div>
        </div>
        <RichTextEditor
          value={joining} onChange={setJoining} rows={10}
          preview={(src) => <JobDescriptionPreview source={src} />}
          hint={<>The first line is the letter&rsquo;s title. Blank lines separate paragraphs; a line beginning with • is a bullet. [Full Name], [Start Date] and the rest fill in for each hire.</>}
        />
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
        <RichTextEditor
          value={r.terms || ""} onChange={(v) => set("terms", v)} rows={12}
          preview={(src) => <JobDescriptionPreview source={src} />}
          hint={<>Select text and use the buttons, or type it: ## Heading · - bullet · 1. numbered · **bold** · *italic* · [text](link). A blank line starts a new clause. The signed PDF renders all of this.</>}
        />
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
