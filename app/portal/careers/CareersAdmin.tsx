"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/ui/logo";
import {
  FIELD_TYPES, defaultFields, fieldId, isCore, DEFAULT_ACCEPT, DEFAULT_MAX_MB, type Field,
} from "@/lib/careers-fields";
import { JobDescriptionPreview } from "@/components/careers/jd";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

type Status = "draft" | "open" | "closed";
type Opening = {
  id?: string; slug?: string; title: string; department: string | null;
  emp_type: string; work_mode: string; location: string | null;
  experience: string | null; compensation: string | null; openings: number;
  summary: string | null; description: string | null; apply_by: string | null;
  status: Status; created_at?: string; form_fields: Field[];
};

const GHOST = "rounded-full bg-card ring-hairline hover:bg-muted text-foreground font-[520] transition-colors";
const GOLD = "btn-gold rounded-full font-[560]";
const card = "card-lux rounded-3xl p-6 sm:p-7";
const input = "w-full text-[14px] neu-inset text-foreground placeholder:text-faint rounded-[12px] px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-gold/25";
const label = "block text-[12px] font-medium text-foreground/70 mb-1.5";
const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

const EMP_TYPES = ["Internship", "Full-time", "Part-time", "Contract"];
const MODES = ["Remote", "Hybrid", "On-site"];

const blank = (): Opening => ({
  title: "", department: "", emp_type: "Internship", work_mode: "Remote", location: "",
  experience: "", compensation: "", openings: 1, summary: "", description: "", apply_by: "", status: "draft",
  form_fields: defaultFields(),
});

async function api(action: string, body: Record<string, unknown> = {}) {
  const r = await fetch("/api/portal/openings", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Save failed");
  return d;
}

export default function CareersAdmin() {
  const [rows, setRows] = useState<Opening[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Opening | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);

  async function copyLink(o: Opening) {
    try {
      await navigator.clipboard.writeText(`${origin}/careers/${o.slug}`);
      setCopied(o.id!); setTimeout(() => setCopied(""), 1600);
    } catch { setErr("Couldn't reach the clipboard — the link is shown under the title."); }
  }
  async function duplicate(o: Opening) {
    setErr("");
    try { await api("duplicate", { id: o.id }); load(); } catch (e) { setErr(msg(e)); }
  }

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/portal/openings");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not load");
      setRows(d.openings || []); setLoaded(true);
    } catch (e) { setErr(msg(e)); setLoaded(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setStatus(o: Opening, status: Status) {
    setErr("");
    try { await api("status", { id: o.id, status }); load(); } catch (e) { setErr(msg(e)); }
  }
  async function remove(o: Opening) {
    if (!confirm(`Delete “${o.title}”? The public page for it stops working immediately.`)) return;
    setErr("");
    try { await api("delete", { id: o.id }); load(); } catch (e) { setErr(msg(e)); }
  }

  const live = rows.filter((r) => r.status === "open");

  return (
    <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-8">
      <header className="flex items-center justify-between gap-3 flex-wrap mb-7">
        <div className="flex items-center gap-3">
          <LogoMark size={30} />
          <div>
            <div className="font-serif text-[17px] font-[600] leading-none">Avloryn <span className="text-gold">Labs</span></div>
            <div className="section-label mt-1">Careers</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href="/careers" target="_blank" rel="noopener noreferrer" className={GHOST + " text-[12.5px] px-3.5 py-1.5"}>View public page ↗</a>
          <a href="/portal" className={GHOST + " text-[12.5px] px-3.5 py-1.5"}>← Home</a>
        </div>
      </header>

      <h1 className="font-serif text-[27px] font-[600] tracking-[-0.01em] mb-1.5">Openings</h1>
      <p className="text-[13px] text-muted-foreground mb-6 max-w-[62ch]">
        What you publish here appears on avloryn.com/careers. Applications are emailed straight to the
        careers inbox with the CV attached — nothing is stored on the site.
      </p>

      {err && (
        <div className="text-[13px] text-[#b3341f] bg-[#fdeeea] border border-[#f3cfc6] rounded-xl px-3 py-2 mb-5">
          {err} <button onClick={() => setErr("")} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {!editing && (
        <button onClick={() => setEditing(blank())} className={GOLD + " px-5 py-2.5 text-[13px] mb-5"}>+ New opening</button>
      )}

      {editing && <Editor value={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} setErr={setErr} />}

      {!loaded ? (
        <div className={card + " text-[13px] text-muted-foreground"}>Loading…</div>
      ) : rows.length === 0 ? (
        <div className={card + " text-[13px] text-muted-foreground"}>No openings yet — create your first one above.</div>
      ) : (
        <>
          <div className="section-label mb-3">{live.length} live · {rows.length} total</div>
          <div className="grid gap-3">
            {rows.map((o) => (
              <div key={o.id} className={card}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-serif text-[17px] font-[600]">{o.title}</span>
                      <StatusChip s={o.status} />
                    </div>
                    <div className="text-[12px] text-muted-foreground mt-1">
                      {[o.department, o.emp_type, o.work_mode, o.location, o.experience].filter(Boolean).join(" · ") || "—"}
                    </div>
                    <a href={`/careers/${o.slug}`} target="_blank" rel="noopener noreferrer" className="text-[11.5px] text-gold hover:underline">
                      /careers/{o.slug} ↗{o.status !== "open" && " (preview — only you can see it)"}
                    </a>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    {o.status !== "open" && <button onClick={() => setStatus(o, "open")} className={GOLD + " text-[12px] px-3.5 py-1.5"}>Publish</button>}
                    {o.status === "open" && (
                      <button onClick={() => copyLink(o)} className={GHOST + " text-[12px] px-3.5 py-1.5"}>
                        {copied === o.id ? "Copied ✓" : "Copy link"}
                      </button>
                    )}
                    {o.status === "open" && <button onClick={() => setStatus(o, "closed")} className={GHOST + " text-[12px] px-3.5 py-1.5"}>Close</button>}
                    <button onClick={() => setEditing(o)} className={GHOST + " text-[12px] px-3.5 py-1.5"}>Edit</button>
                    <button onClick={() => duplicate(o)} className={GHOST + " text-[12px] px-3.5 py-1.5"}>Duplicate</button>
                    <button onClick={() => remove(o)} className="text-[12px] font-semibold text-[#b3341f] hover:underline">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatusChip({ s }: { s: Status }) {
  const map: Record<Status, string> = {
    open: "text-[#1e7a44] bg-[#e8f5ee]",
    draft: "text-[#8a6d1f] bg-[#fbf3dd]",
    closed: "text-muted-foreground bg-muted",
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-[600] uppercase tracking-[0.08em] ${map[s]}`}>{s}</span>;
}

function Editor({ value, onCancel, onSaved, setErr }:
  { value: Opening; onCancel: () => void; onSaved: () => void; setErr: (s: string) => void }) {
  const [o, setO] = useState<Opening>({ ...value });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Opening>(k: K, v: Opening[K]) => setO((x) => ({ ...x, [k]: v }));

  async function save(status?: Status) {
    if (!o.title.trim()) { setErr("Give the role a title."); return; }
    setBusy(true); setErr("");
    try { await api("save", { opening: { ...o, status: status ?? o.status } }); onSaved(); }
    catch (e) { setErr(msg(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className={card + " mb-5"}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-serif text-[17px] font-[600]">{o.id ? "Edit opening" : "New opening"}</h2>
        <button onClick={onCancel} className={GHOST + " text-[12px] px-3.5 py-1.5"}>Close</button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className={label}>Role title *</label>
          <input value={o.title} onChange={(e) => set("title", e.target.value)} className={input} placeholder="e.g. Business Development Intern" />
        </div>
        <div><label className={label}>Department</label>
          <input value={o.department || ""} onChange={(e) => set("department", e.target.value)} className={input} placeholder="e.g. Marketing & Community" /></div>
        <div><label className={label}>Type</label>
          <select value={o.emp_type} onChange={(e) => set("emp_type", e.target.value)} className={input}>
            {EMP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select></div>
        <div><label className={label}>Work mode</label>
          <select value={o.work_mode} onChange={(e) => set("work_mode", e.target.value)} className={input}>
            {MODES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select></div>
        <div><label className={label}>Location <span className="text-faint font-normal">(shown as a chip)</span></label>
          <input value={o.location || ""} onChange={(e) => set("location", e.target.value)} className={input} placeholder="e.g. India · Remote" /></div>
        <div><label className={label}>Experience</label>
          <input value={o.experience || ""} onChange={(e) => set("experience", e.target.value)} className={input} placeholder="e.g. 0–2 years" /></div>
        <div><label className={label}>Stipend / salary</label>
          <input value={o.compensation || ""} onChange={(e) => set("compensation", e.target.value)} className={input} placeholder="Leave blank to not show it" /></div>
        <div><label className={label}>How many openings</label>
          <input type="number" min={1} value={o.openings} onChange={(e) => set("openings", Math.max(1, +e.target.value || 1))} className={input} /></div>
        <div><label className={label}>Applications close <span className="text-faint font-normal">(optional — the role closes itself on this date)</span></label>
          <input type="date" value={o.apply_by || ""} onChange={(e) => set("apply_by", e.target.value)} className={input} /></div>

        <div className="sm:col-span-2">
          <label className={label}>One-line summary <span className="text-faint font-normal">(shown in the list)</span></label>
          <input value={o.summary || ""} onChange={(e) => set("summary", e.target.value)} className={input}
            placeholder="What this person will actually do, in a sentence." />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Full description</label>
          <RichTextEditor
            value={o.description || ""} onChange={(v) => set("description", v)} rows={14}
            preview={(src) => <JobDescriptionPreview source={src} />}
            placeholder={"## What you'll do\n\n- Own outreach to partners\n- Keep the CRM honest\n\n## What we're looking for\n\n- Clear writing\n- Comfortable on calls\n\nQuestions? [Write to us](mailto:operations@avloryn.com)"}
          />
        </div>
      </div>

      <FormBuilder fields={o.form_fields?.length ? o.form_fields : defaultFields()} onChange={(v) => set("form_fields", v)} />

      <div className="flex items-center gap-3 flex-wrap mt-5">
        <button onClick={() => save()} disabled={busy} className={GOLD + " px-5 py-2.5 text-[13px] disabled:opacity-60"}>
          {busy ? "Saving…" : o.id ? "Save changes" : "Save as draft"}
        </button>
        {o.status !== "open" && (
          <button onClick={() => save("open")} disabled={busy} className={GHOST + " px-5 py-2.5 text-[13px] disabled:opacity-60"}>
            Save &amp; publish
          </button>
        )}
        <span className="text-[11.5px] text-faint">Drafts stay private — only published roles appear on the site.</span>
      </div>
    </div>
  );
}


/* ─────────── Application form builder (per role) ─────────── */
function FormBuilder({ fields, onChange }: { fields: Field[]; onChange: (f: Field[]) => void }) {
  const [open, setOpen] = useState(false);
  const patch = (i: number, p: Partial<Field>) => onChange(fields.map((f, x) => (x === i ? { ...f, ...p } : f)));
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const remove = (i: number) => onChange(fields.filter((_, x) => x !== i));
  const add = () => {
    const label = "New question";
    onChange([...fields, { id: fieldId(label, fields.map((f) => f.id)), label, type: "text", required: false, max: 300 }]);
    setOpen(true);
  };

  return (
    <div className="mt-6 border-t border-border pt-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-serif text-[16px] font-[600]">Application form</h3>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            What candidates are asked for this role. {fields.length} question{fields.length === 1 ? "" : "s"} —
            name and email are always included so you can reply to them.
          </p>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} className={GHOST + " text-[12px] px-3.5 py-1.5 shrink-0"}>
          {open ? "Hide questions" : "Edit questions"}
        </button>
      </div>

      {open && (
        <div className="mt-4 grid gap-2.5">
          {fields.map((f, i) => (
            <div key={f.id} className="neu-inset rounded-2xl p-3.5">
              <div className="flex items-start gap-2 flex-wrap">
                <div className="flex flex-col gap-1 pt-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                    className="text-[11px] text-muted-foreground disabled:opacity-25 hover:text-foreground" aria-label="Move up">▲</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === fields.length - 1}
                    className="text-[11px] text-muted-foreground disabled:opacity-25 hover:text-foreground" aria-label="Move down">▼</button>
                </div>

                <div className="flex-1 min-w-[180px]">
                  <input value={f.label} onChange={(e) => patch(i, { label: e.target.value })}
                    className={input + " text-[13.5px] font-[560]"} placeholder="Question" />
                </div>

                <select value={f.type} onChange={(e) => patch(i, { type: e.target.value as Field["type"] })}
                  disabled={isCore(f.id)} className="neu-inset rounded-lg px-2.5 py-2 text-[12.5px] disabled:opacity-50">
                  {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>

                <label className="flex items-center gap-1.5 text-[12px] whitespace-nowrap">
                  <input type="checkbox" checked={f.required} disabled={isCore(f.id)}
                    onChange={(e) => patch(i, { required: e.target.checked })} className="accent-[#c8a24a] disabled:opacity-50" />
                  required
                </label>
                <label className="flex items-center gap-1.5 text-[12px] whitespace-nowrap">
                  <input type="checkbox" checked={!!f.half} onChange={(e) => patch(i, { half: e.target.checked })} className="accent-[#c8a24a]" />
                  half width
                </label>

                {isCore(f.id) ? (
                  <span className="text-[11px] text-faint whitespace-nowrap px-1">always asked</span>
                ) : (
                  <button type="button" onClick={() => remove(i)} className="text-[#b3341f] text-[15px] px-1 leading-none" aria-label="Remove question">×</button>
                )}
              </div>

              {/* Per-type extras */}
              <div className="grid sm:grid-cols-2 gap-2.5 mt-2.5">
                {f.type === "select" && (
                  <div className="sm:col-span-2">
                    <label className={label}>Options <span className="text-faint font-normal">(one per line)</span></label>
                    <textarea rows={3} className={input + " text-[12.5px]"} value={(f.options || []).join("\n")}
                      onChange={(e) => patch(i, { options: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
                  </div>
                )}
                {f.type === "file" && (
                  <>
                    <div>
                      <label className={label}>Accepted files</label>
                      <input className={input + " text-[12.5px]"} value={(f.accept || DEFAULT_ACCEPT).join(", ")}
                        onChange={(e) => patch(i, { accept: e.target.value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean) })}
                        placeholder=".pdf, .doc, .docx" />
                    </div>
                    <div>
                      <label className={label}>Size limit (MB)</label>
                      <input type="number" min={1} max={15} className={input + " text-[12.5px]"} value={f.maxMb ?? DEFAULT_MAX_MB}
                        onChange={(e) => patch(i, { maxMb: Math.min(15, Math.max(1, +e.target.value || DEFAULT_MAX_MB)) })} />
                    </div>
                  </>
                )}
                {["text", "textarea", "url"].includes(f.type) && (
                  <div>
                    <label className={label}>Character limit</label>
                    <input type="number" min={10} max={5000} className={input + " text-[12.5px]"} value={f.max ?? 300}
                      onChange={(e) => patch(i, { max: Math.min(5000, Math.max(10, +e.target.value || 300)) })} />
                  </div>
                )}
                {f.type !== "checkbox" && (
                  <div>
                    <label className={label}>Placeholder <span className="text-faint font-normal">(optional)</span></label>
                    <input className={input + " text-[12.5px]"} value={f.placeholder || ""} onChange={(e) => patch(i, { placeholder: e.target.value })} />
                  </div>
                )}
                <div>
                  <label className={label}>Hint under the field <span className="text-faint font-normal">(optional)</span></label>
                  <input className={input + " text-[12.5px]"} value={f.help || ""} onChange={(e) => patch(i, { help: e.target.value })} />
                </div>
              </div>
            </div>
          ))}

          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={add} className={GHOST + " text-[12.5px] px-4 py-2"}>+ Add question</button>
            <button type="button" onClick={() => { if (confirm("Replace this role's questions with the standard set?")) onChange(defaultFields()); }}
              className="text-[11.5px] font-semibold text-muted-foreground hover:underline">Reset to the standard form</button>
          </div>
        </div>
      )}
    </div>
  );
}
