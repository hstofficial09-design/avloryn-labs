/**
 * The application form is defined per role by the owner, so its shape lives in data rather
 * than in the page. This module is the single description of that shape — imported by the
 * builder, the public form and the API, so all three always agree on what a field is and
 * what counts as a valid answer.
 */

export type FieldType =
  | "text" | "textarea" | "email" | "phone" | "number"
  | "date" | "select" | "url" | "file" | "checkbox";

export type Field = {
  /** Stable key. Renaming a label must not orphan answers already in flight. */
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  /** Small grey line under the field. */
  help?: string;
  /** select only. */
  options?: string[];
  /** file only — extensions the candidate may attach. */
  accept?: string[];
  /** file only — per-file cap. */
  maxMb?: number;
  /** text/textarea/url — character cap. */
  max?: number;
  /** Render two-up on wide screens. */
  half?: boolean;
};

export const FIELD_TYPES: { value: FieldType; label: string; note: string }[] = [
  { value: "text", label: "Short text", note: "A single line" },
  { value: "textarea", label: "Long text", note: "A paragraph" },
  { value: "email", label: "Email", note: "Checked for a valid address" },
  { value: "phone", label: "Phone", note: "Digits, spaces and + only" },
  { value: "number", label: "Number", note: "Digits only" },
  { value: "date", label: "Date", note: "Date picker" },
  { value: "select", label: "Choose one", note: "Dropdown of your options" },
  { value: "url", label: "Link", note: "LinkedIn, portfolio, GitHub…" },
  { value: "file", label: "File upload", note: "CV, portfolio — PDF/DOC/DOCX by default" },
  { value: "checkbox", label: "Tick box", note: "Yes/no confirmation" },
];

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_RE = /^[+\d][\d\s-]{6,19}$/;

export const DEFAULT_ACCEPT = [".pdf", ".doc", ".docx"];
export const DEFAULT_MAX_MB = 5;
/** Across every upload on one application — keeps a submission inside email limits. */
export const TOTAL_UPLOAD_MB = 12;

/**
 * Two fields are always present and cannot be removed: without a name and an email there is
 * nobody to reply to, and the acknowledgement has nowhere to go. The builder renders these
 * as fixed rows.
 */
export const CORE_IDS = ["name", "email"] as const;
export const isCore = (id: string) => (CORE_IDS as readonly string[]).includes(id);

/** What a brand-new role starts with — a sensible application form the owner can then edit. */
export function defaultFields(): Field[] {
  return [
    { id: "name", label: "Full name", type: "text", required: true, half: true, max: 120 },
    { id: "email", label: "Email", type: "email", required: true, half: true },
    { id: "mobile", label: "Mobile", type: "phone", required: true, half: true },
    { id: "city", label: "Current city", type: "text", required: true, half: true, max: 120 },
    {
      id: "experience", label: "Experience", type: "select", required: true, half: true,
      options: ["Student / fresher", "0–1 years", "1–3 years", "3–5 years", "5+ years"],
    },
    {
      id: "availability", label: "Earliest you can start", type: "select", required: true, half: true,
      options: ["Immediately", "Within 2 weeks", "Within a month", "1–2 months", "More than 2 months"],
    },
    { id: "links", label: "LinkedIn / portfolio / GitHub", type: "url", required: false, placeholder: "Paste a link", max: 300 },
    {
      id: "pitch", label: "Why are you a good fit?", type: "textarea", required: true, max: 1500,
      placeholder: "A few honest lines about what you've done and why this role.",
    },
    {
      id: "cv", label: "Your CV", type: "file", required: true,
      accept: DEFAULT_ACCEPT, maxMb: DEFAULT_MAX_MB, help: "PDF, DOC or DOCX",
    },
  ];
}

/** Make an id from a label, keeping it unique within the form. */
export function fieldId(label: string, taken: string[]): string {
  const base =
    String(label).toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "field";
  let id = base;
  for (let i = 2; taken.includes(id); i++) id = `${base}_${i}`;
  return id;
}

/** Anything stored could have been hand-edited or come from an older version — never trust it. */
export function normaliseFields(raw: unknown): Field[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: Field[] = [];
  const seen: string[] = [];
  for (const r of arr) {
    const f = r as Partial<Field>;
    const label = String(f?.label ?? "").trim();
    if (!label) continue;
    const type = (FIELD_TYPES.find((t) => t.value === f?.type)?.value ?? "text") as FieldType;
    const id = f?.id && !seen.includes(String(f.id)) ? String(f.id) : fieldId(label, seen);
    seen.push(id);
    const field: Field = { id, label: label.slice(0, 80), type, required: !!f?.required };
    if (f?.placeholder) field.placeholder = String(f.placeholder).slice(0, 120);
    if (f?.help) field.help = String(f.help).slice(0, 160);
    if (f?.half) field.half = true;
    if (type === "select") {
      field.options = (Array.isArray(f?.options) ? f!.options! : []).map((o) => String(o).trim()).filter(Boolean).slice(0, 30);
      if (!field.options.length) field.options = ["Yes", "No"];
    }
    if (type === "file") {
      const acc = (Array.isArray(f?.accept) ? f!.accept! : DEFAULT_ACCEPT)
        .map((a) => String(a).trim().toLowerCase())
        .filter((a) => /^\.[a-z0-9]{1,6}$/.test(a));
      field.accept = acc.length ? acc.slice(0, 8) : DEFAULT_ACCEPT;
      const mb = Number(f?.maxMb);
      field.maxMb = Number.isFinite(mb) && mb > 0 ? Math.min(mb, 15) : DEFAULT_MAX_MB;
    }
    if (["text", "textarea", "url"].includes(type)) {
      const m = Number(f?.max);
      field.max = Number.isFinite(m) && m > 0 ? Math.min(m, 5000) : type === "textarea" ? 1500 : 300;
    }
    out.push(field);
  }
  if (!out.length) return defaultFields();
  // Guarantee the two fields we cannot operate without, whatever was saved.
  for (const core of defaultFields().filter((f) => isCore(f.id))) {
    if (!out.some((f) => f.id === core.id)) out.unshift(core);
  }
  return out.slice(0, 40);
}

/**
 * Validate one answer. Returns an error message, or null when the answer is acceptable.
 * Shared so the browser and the server can never disagree about what is allowed.
 */
export function validateAnswer(f: Field, value: string): string | null {
  const v = (value ?? "").trim();
  if (!v) return f.required ? `${f.label} is required.` : null;
  switch (f.type) {
    case "email":
      return EMAIL_RE.test(v) ? null : `${f.label} needs a valid email address.`;
    case "phone":
      return PHONE_RE.test(v) ? null : `${f.label} needs a valid phone number.`;
    case "number":
      return /^-?\d+(\.\d+)?$/.test(v) ? null : `${f.label} should be a number.`;
    case "url":
      return /^(https?:\/\/|www\.)\S+\.\S+/i.test(v) || /\.\w{2,}\//.test(v)
        ? null
        : `${f.label} should be a link, e.g. linkedin.com/in/you`;
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : `${f.label} should be a date.`;
    case "select":
      return (f.options || []).includes(v) ? null : `Choose one of the options for ${f.label}.`;
    case "checkbox":
      return v === "Yes" || !f.required ? null : `Please tick ${f.label}.`;
    default:
      return f.max && v.length > f.max ? `${f.label} is too long (max ${f.max} characters).` : null;
  }
}

/** The open-application form: the standard set, plus what they're actually after. */
export function generalFields(): Field[] {
  const base = defaultFields();
  const pitch = base.findIndex((f) => f.id === "pitch");
  const interest: Field = {
    id: "interest", label: "What kind of work are you after?", type: "text", required: true,
    placeholder: "e.g. content and community, backend engineering, design", max: 160,
  };
  base.splice(pitch >= 0 ? pitch : base.length, 0, interest);
  return base;
}
