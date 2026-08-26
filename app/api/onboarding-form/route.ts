import { NextResponse } from "next/server";
import { Resend } from "resend";
import { promises as fs } from "fs";
import path from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type PDFImage,
} from "pdf-lib";
import {
  internshipAgreement,
  ndaAgreement,
  joiningLetter,
  defaultJoiningLetterText,
  parseJoiningLetter,
  ROLE_LABEL,
  roleLabel,
  roleTitle,
  isHrRole,
  parseTermsToContent,
  withSensitiveClause,
  DOC_META,
  type InternData,
  type Clause,
} from "@/lib/intern-docs";
import { listRoles, getFormConfig, getLegalConfig, listRegTypes } from "@/lib/portal-db";
import { getSession } from "@/lib/portal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Normalise a date to ISO YYYY-MM-DD for storage (the form sends it pre-formatted like
// "08 Aug 2026"; storing that verbatim caused a 10-char slice to truncate the year → "202").
const isoDate = (s?: string | null): string | null => {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(String(s))) return String(s).slice(0, 10);
  const d = new Date(String(s));
  // Local calendar date, never toISOString(): that re-expresses local midnight in UTC and
  // shifts the day backwards anywhere east of Greenwich.
  return isNaN(d.getTime()) ? String(s)
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const A4: [number, number] = [595.28, 841.89];
const MARGIN = 54;
const INK = rgb(0.05, 0.05, 0.07);
const MUTED = rgb(0.4, 0.4, 0.44);
const GOLD = rgb(0.79, 0.66, 0.3);

// ---- naive rate limit (per instance) ----
const hits = new Map<string, number[]>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 6;
}

type Fonts = { reg: PDFFont; bold: PDFFont; ital: PDFFont; boldItal: PDFFont };

function b64ToBytes(dataUrlOrB64: string): Uint8Array {
  const b64 = dataUrlOrB64.includes(",")
    ? dataUrlOrB64.split(",")[1]
    : dataUrlOrB64;
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/**
 * pdf-lib's standard fonts use WinAnsi (CP1252). Any character outside it makes
 * widthOfTextAtSize/drawText THROW, which kills the whole submission ("Something went wrong
 * generating your documents"). Role terms are pasted from Word/Docs, so this is inevitable —
 * a single "₹" in an agreement broke every submission for that role.
 *
 * So: map what has a sensible ASCII equivalent, drop anything else, and never throw. A missing
 * glyph is a cosmetic issue; a failed submission loses the hire's signed documents.
 */
const WINANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const CHAR_MAP: Record<string, string> = {
  "₹": "Rs. ", "→": "->", "←": "<-", "⇒": "=>", "≥": ">=", "≤": "<=", "≠": "!=",
  "✓": "-", "✔": "-", "✗": "x", "▪": "-", "◦": "-", "⁃": "-", "−": "-", "‑": "-", "‒": "-",
  " ": " ", " ": " ", " ": " ", "\t": "    ",
  "​": "", "‌": "", "‍": "", "﻿": "", "­": "",
};
export function pdfSafe(s: string): string {
  let out = "";
  for (const ch of String(s ?? "")) {
    const mapped = CHAR_MAP[ch];
    if (mapped !== undefined) { out += mapped; continue; }
    const c = ch.codePointAt(0)!;
    if (ch === "\n" || (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WINANSI_EXTRA.has(ch)) out += ch;
    // anything else is dropped — better a missing character than a lost submission
  }
  return out;
}

/**
 * The portal editors write a small marker language (## heading, - bullet, 1. numbered,
 * **bold**, *italic*, [text](link)). These documents are the legal record, so the PDF has to
 * RENDER those markers — printing a literal "**" in a signed agreement would be worse than
 * not offering the button at all.
 */
type Run = { t: string; b?: boolean; i?: boolean };

function richRuns(src: string): Run[] {
  // A PDF can't hold a clickable link here, so show the address alongside the words.
  const s = pdfSafe(src).replace(/\[([^\]\n]{1,120})\]\(([^)\s]{1,300})\)/g, (_m, t, u) => `${t} (${u})`);
  const out: Run[] = [];
  const re = /(\*\*[^*\n]+\*\*|(?<!\*)\*[^*\n]+\*(?!\*))/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: s.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith("**")) out.push({ t: tok.slice(2, -2), b: true });
    else out.push({ t: tok.slice(1, -1), i: true });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ t: s.slice(last) });
  return out.length ? out : [{ t: s }];
}

function wrap(rawText: string, font: PDFFont, size: number, maxW: number): string[] {
  const text = pdfSafe(rawText);
  const out: string[] = [];
  for (const rawLine of text.split("\n")) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (font.widthOfTextAtSize(test, size) > maxW && line) {
        out.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

/** A cursor-based page writer that auto-adds pages. */
class Doc {
  pdf: PDFDocument;
  fonts: Fonts;
  logo?: PDFImage;
  page!: PDFPage;
  y = 0;
  constructor(pdf: PDFDocument, fonts: Fonts, logo?: PDFImage) {
    this.pdf = pdf;
    this.fonts = fonts;
    this.logo = logo;
    this.addPage();
  }
  addPage() {
    this.page = this.pdf.addPage(A4);
    this.y = A4[1] - MARGIN;
  }
  ensure(space: number) {
    if (this.y - space < MARGIN) this.addPage();
  }
  /**
   * The letterhead.
   *
   * Carries what an LLP must publish on official correspondence: the name, the registered office,
   * the LLPIN and the limited-liability statement. Kept small and grey on the right so the page
   * still reads as a letter rather than a form.
   */
  header() {
    const top = A4[1] - MARGIN;
    if (this.logo) {
      const s = 20;
      this.page.drawImage(this.logo, { x: MARGIN, y: top - s + 4, width: s, height: s });
      this.page.drawText("Avloryn Labs", {
        x: MARGIN + s + 8, y: top - 8, size: 12, font: this.fonts.bold, color: INK,
      });
      this.page.drawText(pdfSafe(DOC_META.COMPANY), {
        x: MARGIN + s + 8, y: top - 19, size: 7.5, font: this.fonts.reg, color: MUTED,
      });
    }

    // The LLPIN line is skipped rather than printed empty when the number isn't configured — a
    // blank "LLPIN:" on a signed letter looks like a mistake.
    const idBits = [DOC_META.LLPIN ? `LLPIN: ${DOC_META.LLPIN}` : "", "PAN: ACOFA6798F"].filter(Boolean);
    const lines = [
      ...DOC_META.REGD_OFFICE_LINES,
      idBits.join("   |   "),
      `${DOC_META.LIMITED_LIABILITY}   |   contact@avloryn.com   |   avloryn.com`,
    ];
    let ly = top - 4;
    // Wide enough that the address breaks at a phrase rather than stranding the PIN code on a
    // line of its own; still clear of the logo and wordmark on the left.
    const maxW = A4[0] - MARGIN * 2 - 128;
    for (const raw of lines) {
      for (const line of this.wrapPlain(pdfSafe(raw), maxW, 7)) {
        const w = this.fonts.reg.widthOfTextAtSize(line, 7);
        this.page.drawText(line, { x: A4[0] - MARGIN - w, y: ly, size: 7, font: this.fonts.reg, color: MUTED });
        ly -= 9;
      }
    }

    const ruleY = Math.min(top - 34, ly - 2);
    this.page.drawRectangle({ x: MARGIN, y: ruleY, width: A4[0] - MARGIN * 2, height: 0.8, color: GOLD });
    this.y = ruleY - 22;
  }

  /** Plain greedy wrap for the letterhead lines (the rich `para` path is for body copy). */
  wrapPlain(s: string, width: number, size: number): string[] {
    const words = s.split(/\s+/).filter(Boolean);
    const out: string[] = [];
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (this.fonts.reg.widthOfTextAtSize(next, size) > width && line) { out.push(line); line = w; }
      else line = next;
    }
    if (line) out.push(line);
    return out;
  }
  title(t: string) {
    this.ensure(40);
    // drawText throws on any non-WinAnsi character — sanitise here too (wrap() handles the rest).
    this.page.drawText(pdfSafe(t).replace(/\n/g, " "), { x: MARGIN, y: this.y, size: 16, font: this.fonts.bold, color: INK });
    this.y -= 8;
    this.page.drawRectangle({ x: MARGIN, y: this.y, width: A4[0] - MARGIN * 2, height: 1.5, color: GOLD });
    this.y -= 20;
  }
  para(text: string, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; gap?: number } = {}) {
    const size = opts.size ?? 10.5;
    const strong = (opts.font ?? this.fonts.reg) === this.fonts.bold;
    const lh = size + 4;
    const color = opts.color ?? INK;
    const pick = (r: Run) =>
      (r.b || strong) ? (r.i ? this.fonts.boldItal : this.fonts.bold) : r.i ? this.fonts.ital : this.fonts.reg;

    for (const rawLine of pdfSafe(text).split("\n")) {
      // A heading or list marker belongs to the line, not to the words.
      let line = rawLine, indent = 0, lineStrong = strong;
      const head = /^#{1,3}\s+/.exec(line);
      if (head) { line = line.slice(head[0].length); lineStrong = true; }
      const bullet = /^[-•*]\s+/.exec(line);
      if (bullet) { line = "• " + line.slice(bullet[0].length); indent = 10; }
      const num = /^(\d+[.)])\s+/.exec(line);
      if (num) { line = `${num[1]} ` + line.slice(num[0].length); indent = 10; }

      const maxW = A4[0] - MARGIN * 2 - indent;
      // Lay words out one at a time so a bold phrase can wrap mid-sentence.
      const words: { w: string; f: PDFFont }[] = [];
      for (const r of richRuns(line)) {
        const f = lineStrong && !r.b ? (r.i ? this.fonts.boldItal : this.fonts.bold) : pick(r);
        for (const w of r.t.split(/\s+/)) if (w) words.push({ w, f });
      }
      if (!words.length) { this.y -= lh; continue; }

      let row: { w: string; f: PDFFont }[] = [];
      const rowWidth = (arr: typeof row) =>
        arr.reduce((n, p, i) => n + p.f.widthOfTextAtSize(p.w, size) + (i ? p.f.widthOfTextAtSize(" ", size) : 0), 0);
      const flush = () => {
        if (!row.length) return;
        this.ensure(lh);
        let x = MARGIN + indent;
        row.forEach((p, i) => {
          if (i) x += p.f.widthOfTextAtSize(" ", size);
          this.page.drawText(p.w, { x, y: this.y, size, font: p.f, color });
          x += p.f.widthOfTextAtSize(p.w, size);
        });
        this.y -= lh;
        row = [];
      };
      for (const word of words) {
        if (row.length && rowWidth([...row, word]) > maxW) flush();
        row.push(word);
      }
      flush();
    }
    this.y -= opts.gap ?? 6;
  }
  clause(c: Clause) {
    if (c.h) this.para(c.h, { font: this.fonts.bold, size: 10.5, gap: 2 });
    this.para(c.t, { gap: 10 });
  }
  kv(k: string, v: string) {
    this.ensure(16);
    this.page.drawText(pdfSafe(k).replace(/\n/g, " "), { x: MARGIN, y: this.y, size: 10, font: this.fonts.bold, color: MUTED });
    for (const line of wrap(v, this.fonts.reg, 10.5, A4[0] - MARGIN * 2 - 150)) {
      this.page.drawText(line, { x: MARGIN + 150, y: this.y, size: 10.5, font: this.fonts.reg, color: INK });
      this.y -= 15;
    }
    this.y -= 3;
  }
}

function addAgreement(doc: Doc, content: ReturnType<typeof internshipAgreement>, signImg: PDFImage | undefined, d: InternData) {
  doc.addPage();
  doc.header();
  doc.title(content.title);
  doc.para(content.intro, { gap: 12 });
  for (const c of content.clauses) doc.clause(c);
  // signature block
  doc.ensure(90);
  doc.y -= 10;
  doc.para("Signed by the Intern (electronically):", { font: doc.fonts.bold, size: 10, gap: 4 });
  if (signImg) {
    const w = 150;
    const h = (signImg.height / signImg.width) * w;
    doc.ensure(h + 10);
    doc.page.drawImage(signImg, { x: MARGIN, y: doc.y - h, width: w, height: Math.min(h, 50) });
    doc.y -= Math.min(h, 50) + 6;
  }
  doc.para(`${d.fullName}`, { size: 10.5, gap: 2 });
  doc.para(`Date: ${d.signedAt}${d.place ? "   Place: " + d.place : ""}`, { size: 9.5, color: MUTED, gap: 4 });
}

async function embedImageOrPdf(target: PDFDocument, file: { kind: string; b64: string } | undefined, doc: Doc, caption: string) {
  if (!file) return;
  const bytes = b64ToBytes(file.b64);
  if (file.kind === "pdf") {
    const src = await PDFDocument.load(bytes);
    const pages = await target.copyPages(src, src.getPageIndices());
    // caption page then the pdf pages
    doc.addPage();
    doc.header();
    doc.para(caption, { font: doc.fonts.bold, size: 11 });
    pages.forEach((p) => target.addPage(p));
  } else {
    let img: PDFImage;
    try {
      img = file.kind === "png" ? await target.embedPng(bytes) : await target.embedJpg(bytes);
    } catch {
      return;
    }
    doc.addPage();
    doc.header();
    doc.para(caption, { font: doc.fonts.bold, size: 11, gap: 8 });
    const maxW = A4[0] - MARGIN * 2;
    const maxH = doc.y - MARGIN;
    let w = img.width, h = img.height;
    const scale = Math.min(maxW / w, maxH / h, 1);
    w *= scale; h *= scale;
    doc.page.drawImage(img, { x: MARGIN, y: doc.y - h, width: w, height: h });
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  // Preview is OWNER-ONLY: it runs the whole builder, so without the check anyone could mint a
  // signed-looking joining letter with a name of their choosing.
  const isPreview = body.preview === true && (await getSession())?.role === "owner";

  // honeypot
  if (typeof body.company === "string" && (body.company as string).trim() !== "") {
    return NextResponse.json({ ok: true });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ ok: false, error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const dRaw = (body.data ?? {}) as Record<string, string>;
  const d: InternData = {
    fullName: (dRaw.fullName || "").trim(),
    mobile: (dRaw.mobile || "").trim(),
    email: (dRaw.email || "").trim(),
    address: (dRaw.address || "").trim(),
    role: (dRaw.role || "M&C").trim(), // dynamic — any role label/code from the form
    startDate: (dRaw.startDate || "").trim(),
    duration: (["2", "3", "6"].includes(dRaw.duration) ? dRaw.duration : "3"),
    idType: (dRaw.idType || "").trim(),
    idNumber: (dRaw.idNumber || "").trim(),
    isStudent: !!body.isStudent,
    collegeName: (dRaw.collegeName || "").trim(),
    studentId: (dRaw.studentId || "").trim(),
    signedAt: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
  };
  const dob = (dRaw.dob || "").trim();
  const signature = typeof body.signature === "string" ? (body.signature as string) : "";
  const consent = !!body.consent;
  // Which kind of person this is. Validated against what the owner actually offers rather than
  // trusted: this becomes employees.emp_type, which the dashboards, the documents and the partner
  // rules all read, so an unknown value posted straight at this endpoint must not create one.
  // Anything unrecognised falls back to the first offered kind.
  let regTypeKey = String(dRaw.regType || "").trim().toLowerCase();
  let regType = "Intern";
  try {
    const offered = (await listRegTypes()).filter((t) => t.enabled);
    const hit = offered.find((t) => t.key === regTypeKey) || offered[0];
    if (hit) { regTypeKey = hit.key; regType = hit.label; }
    else { regTypeKey = "intern"; }
  } catch {
    // No config reachable — behave exactly as before rather than refusing a real submission.
    regTypeKey = regTypeKey === "employee" ? "employee" : "intern";
    regType = regTypeKey === "employee" ? "Employee" : "Intern";
  }

  // What THIS kind asks, falling back to the shared settings when it has none of its own.
  //
  // This read the shared config regardless, so a kind that switched a field off still had it
  // demanded here: the form would stop showing it and then refuse to submit without it, with no
  // way for the person to satisfy a question they were never asked.
  let formCfg: { fields?: Record<string, { visible?: boolean; required?: boolean }>; custom?: { label: string; required?: boolean; roles?: string[] }[] } = {};
  try { formCfg = ((await getFormConfig()) || {}) as any; } catch { /* default required */ }
  const kindForm = (await listRegTypes(true).catch(() => [])).find((t) => t.key === regTypeKey) || null;
  const fld = (kindForm?.fields && Object.keys(kindForm.fields).length ? kindForm.fields : formCfg.fields) || {};
  const need = (k: string) => fld[k]?.visible !== false && fld[k]?.required !== false;

  // Custom answers are checked against the questions the OWNER configured, not the list the
  // client posted — otherwise a required question could simply be omitted, and any extra
  // key the client invented would land in the record PDF.
  //
  // A question tied to particular tracks is only asked of those tracks: a work-sample link means
  // nothing to a business-development partner, and requiring it would block them outright.
  const allConfigured = (Array.isArray(kindForm?.custom) && kindForm!.custom!.length
    ? kindForm!.custom!
    : (Array.isArray(formCfg.custom) ? formCfg.custom : [])).filter((q: any) => q?.label);
  const configured = allConfigured.filter((q: any) => !q?.roles?.length || q.roles.includes(d.role));
  const posted = new Map(
    (Array.isArray(body.custom) ? (body.custom as { q: string; a: string }[]) : [])
      .filter((x) => x && x.q)
      .map((x) => [String(x.q).trim(), String(x.a ?? "").trim()]),
  );
  const custom = configured
    .map((q) => ({ q: String(q.label).trim(), a: posted.get(String(q.label).trim()) || "" }))
    .filter((x) => x.a);

  // The three that cannot be switched off, then whatever this kind still requires. Checked here
  // as well as in the browser: the switches are the owner's rules, and rules that only exist in
  // the page are not rules.
  if (!d.fullName || !EMAIL_RE.test(d.email) || !signature || !consent
    || (need("mobile") && !d.mobile) || (need("address") && !d.address) || (need("govId") && (!d.idType || !String(d.idNumber || "").trim()))
    || (need("dob") && !dob) || (need("startDate") && !d.startDate) || (need("role") && !d.role)) {
    return NextResponse.json({ ok: false, error: "Please complete all required fields, sign, and accept the terms." }, { status: 400 });
  }
  for (const q of configured) {
    if (q.required && !posted.get(String(q.label).trim())) {
      return NextResponse.json({ ok: false, error: `Please answer: ${q.label}` }, { status: 400 });
    }
  }

  // env
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM = process.env.CONTACT_FROM_EMAIL || "Avloryn Labs <onboarding@resend.dev>";
  const OWNER = process.env.INTERN_TO_EMAIL || process.env.CONTACT_TO_EMAIL || "contact@avloryn.com";
  if (!RESEND_API_KEY) {
    return NextResponse.json({ ok: false, error: "Email is not configured on the server." }, { status: 500 });
  }

  try {
    // ---- fonts + assets ----
    const mk = async () => {
      const pdf = await PDFDocument.create();
      const reg = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const ital = await pdf.embedFont(StandardFonts.HelveticaOblique);
      const boldItal = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
      let logo: PDFImage | undefined;
      try {
        const bytes = await fs.readFile(path.join(process.cwd(), "public", "avloryn-mark.png"));
        logo = await pdf.embedPng(new Uint8Array(bytes));
      } catch {}
      return { pdf, fonts: { reg, bold, ital, boldItal }, logo };
    };

    const files = (body.files ?? {}) as Record<string, { kind: string; b64: string }>;
    // Use the owner-edited Terms for this role if set, else the standard agreement.
    let roleCfg: any = null;
    try { const rs = await listRoles(); roleCfg = rs.find((r) => r.track === d.role || r.track === roleLabel(d.role)) || null; } catch { /* fall back to default */ }
    if (roleCfg?.paid) { d.paid = true; d.salary = roleCfg.salary; d.salaryPeriod = roleCfg.salary_period; }
    // What the role does, as written against it. Offered in the editor as "shown in the agreement"
    // and, until now, read by nothing.
    d.scope = roleCfg?.scope || null;
    d.probation = roleCfg?.probation || null;
    const kindCfg = (await listRegTypes(true).catch(() => [])).find((t) => t.key === regTypeKey) || null;
    // What this kind's documents call the engagement and the person signing. Without them the
    // shared NDA addressed a partner as "the Intern", and the letter welcomed them as a
    // "…Partnership Intern".
    d.kindNoun = kindCfg ? (kindCfg.doc_noun || regType) : regType;
    d.partyName = kindCfg?.label || regType;
    // Which agreement gets signed: this role's own text, then the KIND's default, and only then
    // the built-in template.
    //
    // The kind's default matters because the built-in one is an internship agreement in substance
    // — "unpaid internship", "no employer-employee relationship is created". Handing it to an
    // employee is not clumsy wording, it is the wrong document saying close to the opposite of
    // what was meant, and they would sign it.
    const agreementText = (roleCfg?.terms && String(roleCfg.terms).trim())
      || (kindCfg?.terms && String(kindCfg.terms).trim())
      || null;
    const ia = agreementText ? parseTermsToContent(agreementText, d) : internshipAgreement(d);
    // A role marked "Handles sensitive data" signs an extra NDA clause.
    d.sensitive = !!roleCfg?.sensitive;
    let legal: any = null;
    try { legal = await getLegalConfig(); } catch { /* fall back to the standard NDA */ }
    const ownNda = legal?.nda && String(legal.nda).trim();
    const nda = ownNda
      ? (d.sensitive ? withSensitiveClause(parseTermsToContent(String(legal.nda), d), d.partyName) : parseTermsToContent(String(legal.nda), d))
      : ndaAgreement(d);

    // ===== OWNER PDF: cover + uploads + signed agreements =====
    const o = await mk();
    const signImgO = await o.pdf.embedPng(b64ToBytes(signature)).catch(() => undefined);
    const od = new Doc(o.pdf, o.fonts, o.logo);
    od.header();
    od.title("Onboarding — Submission");
    // Only what this kind was actually asked. Every line used to print regardless, so a record
    // for someone never asked about a duration read "Duration:  months", and one for a kind with
    // no student question still asserted "Current student: No" — a fact nobody had supplied.
    const shown = (k: string) => fld[k]?.visible !== false;
    od.kv("Registering as", regType);
    od.kv("Name", d.fullName);
    if (shown("dob") && dob) od.kv("Date of birth", dob);
    // The noun, so a partner is not filed as a "…Partnership Intern" on their own record.
    if (shown("role") && d.role) od.kv("Role", roleTitle(d.role, d.kindNoun));
    if (shown("mobile") && d.mobile) od.kv("Mobile", d.mobile);
    od.kv("Email", d.email);
    if (shown("address") && d.address) od.kv("Address", d.address);
    if (shown("govId") && d.idType) od.kv("ID type", `${d.idType}${d.idNumber ? " · " + d.idNumber : ""}`);
    if (shown("student")) {
      od.kv("Current student", d.isStudent
        ? `Yes${d.collegeName ? " · " + d.collegeName : ""}${d.studentId ? " · ID " + d.studentId : ""}`
        : "No");
    }
    if (shown("startDate") && d.startDate) od.kv("Start date", d.startDate);
    if (shown("duration") && d.duration) od.kv("Duration", `${d.duration} months`);
    if ((roleCfg?.probation || "").trim()) od.kv("Probation", String(roleCfg.probation).trim());
    for (const c of custom) od.kv(c.q, c.a);
    od.kv("Submitted", d.signedAt);
    await embedImageOrPdf(o.pdf, files.photo, od, "Photo");
    await embedImageOrPdf(o.pdf, files.idDoc, od, `Photo ID (${d.idType})`);
    if (d.isStudent) await embedImageOrPdf(o.pdf, files.studentDoc, od, "Student ID");
    addAgreement(od, ia, signImgO, d);
    addAgreement(od, nda, signImgO, d);
    const ownerBytes = await o.pdf.save();

    // ===== INTERN PDF: joining letter + signed agreements =====
    const n = await mk();
    const signImgN = await n.pdf.embedPng(b64ToBytes(signature)).catch(() => undefined);
    const nd = new Doc(n.pdf, n.fonts, n.logo);
    nd.header();
    // The owner's letter for this role when they have written one, else the built-in template.
    // Same source as the editor shows, so what is signed is what was previewed.
    const letterText = (roleCfg?.joining_letter && String(roleCfg.joining_letter).trim())
      || (kindCfg?.joining && String(kindCfg.joining).trim())
      || defaultJoiningLetterText(d, regType);
    const jl = parseJoiningLetter(letterText, d);
    nd.title(jl.title);
    nd.para(new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), { size: 10, color: MUTED, gap: 10 });
    for (const p of jl.paragraphs) nd.para(p, { gap: 8 });
    for (const b of jl.bullets) nd.para("•  " + b, { size: 10.5, gap: 3 });
    nd.y -= 6;
    // Nothing is printed here any more. These closing lines used to be appended AFTER the owner's
    // letter, so an Employment letter still ended with intern wording that could not be edited
    // away. They are part of the letter's own text now.
    for (const p2 of jl.closing) nd.para(p2, { gap: 8 });
    nd.para("Warm regards,", { gap: 6 });
    // Both designated partners sign, side by side. An LLP acts through its designated partners,
    // so an offer carrying both is signed by the firm rather than by one person in it.
    {
      const colW = (A4[0] - MARGIN * 2) / 2;
      const boxH = 52;
      nd.ensure(boxH + 34);
      const top = nd.y;
      for (let i = 0; i < DOC_META.SIGNATORIES.length; i++) {
        const sg = DOC_META.SIGNATORIES[i];
        const x = MARGIN + i * colW;
        try {
          const bytes = await fs.readFile(path.join(process.cwd(), "public", sg.sig));
          const img = await n.pdf.embedPng(new Uint8Array(bytes));
          // Match on HEIGHT first so two signatures of different proportions carry the same
          // visual weight — fitting by width alone left the wider one looking half the size.
          const scale = Math.min(boxH / img.height, 150 / img.width);
          nd.page.drawImage(img, {
            x, y: top - img.height * scale, width: img.width * scale, height: img.height * scale,
          });
        } catch { /* no image on this deployment — the printed name still identifies the signatory */ }
        // Sits just under the stroke — the name belongs to the signature above it, not to the
        // white space between them.
        nd.page.drawText(pdfSafe(sg.name), {
          x, y: top - boxH - 4, size: 10.5, font: n.fonts.bold, color: INK,
        });
        nd.page.drawText(pdfSafe(`${sg.title}, ${DOC_META.COMPANY}`), {
          x, y: top - boxH - 15, size: 9, font: n.fonts.reg, color: MUTED,
        });
      }
      nd.y = top - boxH - 26;
    }
    addAgreement(nd, ia, signImgN, d);
    addAgreement(nd, nda, signImgN, d);
    const internBytes = await n.pdf.save();

    // Owner preview: hand back the joining letter itself instead of emailing it and recording a
    // hire. Deliberately built by this same code path — a preview generated any other way could
    // drift from what a real candidate actually receives, which is the one thing it must not do.
    if (isPreview) {
      return new Response(Buffer.from(internBytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="joining-letter-preview.pdf"',
          "Cache-Control": "no-store",
        },
      });
    }

    // ---- emails ----
    const resend = new Resend(RESEND_API_KEY);
    const safe = d.fullName.replace(/[^a-z0-9]+/gi, "_");
    const firstName = d.fullName.trim().split(/\s+/)[0] || d.fullName;
    const rOwner = await resend.emails.send({
      from: FROM,
      to: OWNER,
      subject: `${firstName} onboarding form`,
      text: `${d.fullName} (${roleLabel(d.role)}) has completed onboarding.\nMobile: ${d.mobile}\nEmail: ${d.email}\nSubmitted: ${d.signedAt}\n\nAttached: (1) full record — details + ID + signed agreements, (2) the Joining Letter sent to the intern.`,
      attachments: [
        { filename: `Onboarding_${safe}.pdf`, content: Buffer.from(ownerBytes).toString("base64") },
        { filename: `JoiningLetter_${safe}.pdf`, content: Buffer.from(internBytes).toString("base64") },
      ],
    });
    const rIntern = await resend.emails.send({
      from: FROM,
      to: d.email,
      subject: `Welcome to Avloryn Labs — Your Joining Letter`,
      text: `Dear ${d.fullName},\n\nWelcome to Avloryn Labs! Your Joining Letter and signed agreements are attached.\nWe're excited to build with you.\n\n— Team Avloryn Labs`,
      attachments: [{ filename: `Avloryn_JoiningLetter_${safe}.pdf`, content: Buffer.from(internBytes).toString("base64") }],
    });
    if (rOwner.error || rIntern.error) {
      console.error("[intern-onboarding] resend error:", JSON.stringify(rOwner.error || rIntern.error));
      return NextResponse.json({ ok: false, error: "Email delivery failed. Please try again." }, { status: 502 });
    }

    // ---- optional Supabase record (best-effort) ----
    try {
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const { getSupabaseAdmin } = await import("@/lib/supabase");
        const sb = getSupabaseAdmin();
        if (sb) {
          await sb.from("intern_onboarding").insert({
            reg_type: regType,
            full_name: d.fullName, mobile: d.mobile, email: d.email, address: d.address,
            role: d.role, start_date: isoDate(d.startDate), duration: d.duration,
            id_type: d.idType, id_number: d.idNumber, is_student: d.isStudent,
            college: d.collegeName, student_id: d.studentId, submitted_at: new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      console.error("[intern-onboarding] supabase skip:", e);
    }

    // ---- best-effort: add this person to the shared Partner Portal registry ----
    // They appear in the portal / LivoDraft admin automatically; the owner just sets
    // a login password + code. Never blocks the onboarding response.
    try {
      if (process.env.LIVODRAFT_DATABASE_URL) {
        const { upsertEmployeeFromOnboarding } = await import("@/lib/portal-db");
        await upsertEmployeeFromOnboarding({
          name: d.fullName,
          email: d.email,
          mobile: d.mobile,
          emp_type: regTypeKey,
          track: roleLabel(d.role) || "",
          dob: isoDate(dob) ?? undefined,   // store one consistent format, like start_date
          address: d.address,
          id_type: d.idType,
          id_number: d.idNumber,
          is_student: d.isStudent ? "Yes" : "No",
          college: d.collegeName,
          student_id: d.studentId,
          start_date: isoDate(d.startDate) ?? undefined,
          duration: `${d.duration} months`,
          custom_answers: custom.length ? JSON.stringify(custom) : undefined,
        });
      }
    } catch (e) {
      console.error("[intern-onboarding] registry skip:", e);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[intern-onboarding] error:", e);
    return NextResponse.json({ ok: false, error: "Something went wrong generating your documents. Please try again." }, { status: 500 });
  }
}
