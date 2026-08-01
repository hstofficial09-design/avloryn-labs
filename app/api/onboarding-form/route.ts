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
  ROLE_LABEL,
  DOC_META,
  type InternData,
  type Role,
  type Clause,
} from "@/lib/intern-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

type Fonts = { reg: PDFFont; bold: PDFFont };

function b64ToBytes(dataUrlOrB64: string): Uint8Array {
  const b64 = dataUrlOrB64.includes(",")
    ? dataUrlOrB64.split(",")[1]
    : dataUrlOrB64;
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
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
  header() {
    if (this.logo) {
      const s = 20;
      this.page.drawImage(this.logo, {
        x: MARGIN,
        y: A4[1] - MARGIN - s + 4,
        width: s,
        height: s,
      });
      this.page.drawText("Avloryn Labs", {
        x: MARGIN + s + 8,
        y: A4[1] - MARGIN - 8,
        size: 12,
        font: this.fonts.bold,
        color: INK,
      });
    }
    this.y = A4[1] - MARGIN - 40;
  }
  title(t: string) {
    this.ensure(40);
    this.page.drawText(t, { x: MARGIN, y: this.y, size: 16, font: this.fonts.bold, color: INK });
    this.y -= 8;
    this.page.drawRectangle({ x: MARGIN, y: this.y, width: A4[0] - MARGIN * 2, height: 1.5, color: GOLD });
    this.y -= 20;
  }
  para(text: string, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; gap?: number } = {}) {
    const size = opts.size ?? 10.5;
    const font = opts.font ?? this.fonts.reg;
    const lh = size + 4;
    const maxW = A4[0] - MARGIN * 2;
    for (const line of wrap(text, font, size, maxW)) {
      this.ensure(lh);
      this.page.drawText(line, { x: MARGIN, y: this.y, size, font, color: opts.color ?? INK });
      this.y -= lh;
    }
    this.y -= opts.gap ?? 6;
  }
  clause(c: Clause) {
    if (c.h) this.para(c.h, { font: this.fonts.bold, size: 10.5, gap: 2 });
    this.para(c.t, { gap: 10 });
  }
  kv(k: string, v: string) {
    this.ensure(16);
    this.page.drawText(k, { x: MARGIN, y: this.y, size: 10, font: this.fonts.bold, color: MUTED });
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
    role: (dRaw.role === "P&R" ? "P&R" : dRaw.role === "HR" ? "HR" : "M&C") as Role,
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
  const regType = dRaw.regType === "employee" ? "Employee" : "Intern";

  if (!d.fullName || !d.mobile || !EMAIL_RE.test(d.email) || !d.address || !d.idType || !signature || !consent) {
    return NextResponse.json({ ok: false, error: "Please complete all required fields, sign, and accept the terms." }, { status: 400 });
  }

  // env
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM = process.env.CONTACT_FROM_EMAIL || "Avloryn Labs <onboarding@resend.dev>";
  const OWNER = process.env.INTERN_TO_EMAIL || process.env.CONTACT_TO_EMAIL || "hardev@avloryn.com";
  if (!RESEND_API_KEY) {
    return NextResponse.json({ ok: false, error: "Email is not configured on the server." }, { status: 500 });
  }

  try {
    // ---- fonts + assets ----
    const mk = async () => {
      const pdf = await PDFDocument.create();
      const reg = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      let logo: PDFImage | undefined;
      try {
        const bytes = await fs.readFile(path.join(process.cwd(), "public", "avloryn-mark.png"));
        logo = await pdf.embedPng(new Uint8Array(bytes));
      } catch {}
      return { pdf, fonts: { reg, bold }, logo };
    };

    const files = (body.files ?? {}) as Record<string, { kind: string; b64: string }>;
    const ia = internshipAgreement(d);
    const nda = ndaAgreement(d);

    // ===== OWNER PDF: cover + uploads + signed agreements =====
    const o = await mk();
    const signImgO = await o.pdf.embedPng(b64ToBytes(signature)).catch(() => undefined);
    const od = new Doc(o.pdf, o.fonts, o.logo);
    od.header();
    od.title("Onboarding — Submission");
    od.kv("Registering as", regType);
    od.kv("Name", d.fullName);
    od.kv("Date of birth", dob);
    od.kv("Role", `${ROLE_LABEL[d.role]} Intern`);
    od.kv("Mobile", d.mobile);
    od.kv("Email", d.email);
    od.kv("Address", d.address);
    od.kv("ID type", `${d.idType}${d.idNumber ? " · " + d.idNumber : ""}`);
    od.kv("Current student", d.isStudent
      ? `Yes${d.collegeName ? " · " + d.collegeName : ""}${d.studentId ? " · ID " + d.studentId : ""}`
      : "No");
    od.kv("Start date", d.startDate);
    od.kv("Duration", `${d.duration} months`);
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
    nd.title("Internship Joining Letter");
    const jl = joiningLetter(d);
    nd.para(new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), { size: 10, color: MUTED, gap: 10 });
    for (const p of jl.paragraphs) nd.para(p, { gap: 8 });
    for (const b of jl.bullets) nd.para("•  " + b, { size: 10.5, gap: 3 });
    nd.y -= 6;
    nd.para(d.role === "HR"
      ? "On successful completion of your internship, you will receive an Internship Completion Certificate. Outstanding performers will also receive a Letter of Recommendation, a LinkedIn recommendation, and first preference for future paid roles."
      : "On successful completion (a minimum of 3 months is required), you will receive an Internship Completion Certificate. An intern who leaves before completing 3 months is not eligible for a certificate or any other benefit. Standout performers will also receive a Letter of Recommendation and first preference for future paid roles.",
      { gap: 8 });
    nd.para("This offer is subject to your signed Internship Agreement and NDA (attached).", { gap: 14 });
    nd.para("Warm regards,", { gap: 4 });
    // owner signature (stored image if present) else name
    try {
      const sigBytes = await fs.readFile(path.join(process.cwd(), "public", "founder-signature.png"));
      const sig = await n.pdf.embedPng(new Uint8Array(sigBytes));
      // fit within 130w x 54h, preserving aspect ratio (no squish)
      const scale = Math.min(130 / sig.width, 54 / sig.height);
      const w = sig.width * scale, h = sig.height * scale;
      nd.ensure(h + 4);
      nd.page.drawImage(sig, { x: MARGIN, y: nd.y - h, width: w, height: h });
      nd.y -= h + 4;
    } catch {}
    nd.para(`${DOC_META.FOUNDER}`, { font: n.fonts.bold, size: 10.5, gap: 1 });
    nd.para(`Founder, ${DOC_META.COMPANY}  ·  hardev@avloryn.com`, { size: 9.5, color: MUTED });
    addAgreement(nd, ia, signImgN, d);
    addAgreement(nd, nda, signImgN, d);
    const internBytes = await n.pdf.save();

    // ---- emails ----
    const resend = new Resend(RESEND_API_KEY);
    const safe = d.fullName.replace(/[^a-z0-9]+/gi, "_");
    const firstName = d.fullName.trim().split(/\s+/)[0] || d.fullName;
    const rOwner = await resend.emails.send({
      from: FROM,
      to: OWNER,
      subject: `${firstName} onboarding form`,
      text: `${d.fullName} (${ROLE_LABEL[d.role]}) has completed onboarding.\nMobile: ${d.mobile}\nEmail: ${d.email}\nSubmitted: ${d.signedAt}\n\nAttached: (1) full record — details + ID + signed agreements, (2) the Joining Letter sent to the intern.`,
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
            role: d.role, start_date: d.startDate, duration: d.duration,
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
          emp_type: regType === "Employee" ? "employee" : "intern",
          track: (ROLE_LABEL[d.role] as string) || d.role || "",
          dob,
          address: d.address,
          id_type: d.idType,
          id_number: d.idNumber,
          is_student: d.isStudent ? "Yes" : "No",
          college: d.collegeName,
          student_id: d.studentId,
          start_date: d.startDate,
          duration: `${d.duration} months`,
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
