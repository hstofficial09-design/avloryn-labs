/**
 * Work-log PDFs — two documents, deliberately different.
 *
 *  1. TASK LOG            — the factual record: every task, when it was set, when it was due,
 *                           when it was delivered, on time or not. Anyone may download their own.
 *  2. PERFORMANCE REPORT  — the task log PLUS the owner's weekly scores, the whole-tenure score
 *                           and the founder's signature. Owner-issued only.
 *
 * They are separate because they are different kinds of document. The log states what happened;
 * the report is an assessment. A signed assessment should be issued deliberately by the person
 * whose name is on it — not self-downloadable at any moment by its subject, who could otherwise
 * pull a signed report mid-tenure, on a bad week, and pass it off as final.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fs from "fs/promises";
import path from "path";
import { REVIEW_CRITERIA, taskStatus, workStats, reviewAverage, type Task, type Review, type TenureScore } from "./portal-db";

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 46;
const INK = rgb(0.05, 0.05, 0.05);
const MUTED = rgb(0.42, 0.42, 0.42);
const GOLD = rgb(0.67, 0.545, 0.298);
const LINE = rgb(0.87, 0.86, 0.84);
const OK = rgb(0.12, 0.48, 0.27);
const BAD = rgb(0.70, 0.20, 0.12);

/**
 * pdf-lib's standard fonts are WinAnsi: a rupee sign or a smart quote throws and takes the whole
 * download with it. Learned from an onboarding submission that died on "₹".
 */
export function pdfSafe(s: string): string {
  return String(s ?? "")
    .replace(/₹/g, "Rs. ")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—―]/g, "-")
    .replace(/…/g, "...")
    .replace(/[·•]/g, "-")
    .replace(/[   ]/g, " ")
    .replace(/[^\x20-\x7E\n]/g, "");
}

/** Date + time, in IST, the way a person reads it. */
const fmt = (iso: string | null, withTime = true): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: true } : {}),
  }).replace(",", "");
};
const fmtDay = (iso: string | null) => fmt(iso, false);

/** Column heads for the weekly grid — five full criterion names do not fit across a page. */
const SHORT: Record<string, string> = {
  completion: "TASKS", quality: "QUALITY", timeliness: "TIME",
  communication: "COMMS", ownership: "OWNER",
};

const STATUS_TEXT: Record<string, string> = {
  on_time: "On time", late: "Late", no_deadline: "Delivered",
  overdue: "Overdue", pending: "Pending",
};

class Sheet {
  pdf!: PDFDocument;
  page!: PDFPage;
  reg!: PDFFont;
  bold!: PDFFont;
  ital!: PDFFont;
  y = 0;

  static async create() {
    const s = new Sheet();
    s.pdf = await PDFDocument.create();
    s.reg = await s.pdf.embedFont(StandardFonts.Helvetica);
    s.bold = await s.pdf.embedFont(StandardFonts.HelveticaBold);
    s.ital = await s.pdf.embedFont(StandardFonts.HelveticaOblique);
    s.newPage();
    return s;
  }

  get width() { return this.page.getWidth(); }
  get usable() { return this.width - MARGIN * 2; }

  newPage() {
    this.page = this.pdf.addPage(A4);
    this.y = this.page.getHeight() - MARGIN;
  }

  /** Make sure `h` points of room exist, else start a new page. */
  ensure(h: number) {
    if (this.y - h < MARGIN + 28) this.newPage();
  }

  text(s: string, o: { x?: number; size?: number; font?: PDFFont; color?: any } = {}) {
    this.page.drawText(pdfSafe(s), {
      x: o.x ?? MARGIN, y: this.y, size: o.size ?? 10,
      font: o.font ?? this.reg, color: o.color ?? INK,
    });
  }

  /** Wrap `s` to `width`, returning the lines. */
  wrap(s: string, width: number, font: PDFFont, size: number): string[] {
    const lines: string[] = [];
    for (const para of pdfSafe(s).split("\n")) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(""); continue; }
      let line = "";
      for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(next, size) > width && line) { lines.push(line); line = w; }
        else line = next;
      }
      if (line) lines.push(line);
    }
    return lines.length ? lines : [""];
  }

  para(s: string, o: { size?: number; font?: PDFFont; color?: any; gap?: number } = {}) {
    const size = o.size ?? 10, font = o.font ?? this.reg;
    for (const line of this.wrap(s, this.usable, font, size)) {
      this.ensure(size + 4);
      this.text(line, { size, font, color: o.color });
      this.y -= size + 3.5;
    }
    this.y -= o.gap ?? 6;
  }

  rule(gap = 8) {
    this.ensure(gap + 2);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y }, end: { x: this.width - MARGIN, y: this.y },
      thickness: 0.7, color: LINE,
    });
    this.y -= gap;
  }

  header(company = "Avloryn Labs LLP") {
    this.text(company, { font: this.bold, size: 12.5 });
    this.text("avloryn.com", { x: this.width - MARGIN - this.reg.widthOfTextAtSize("avloryn.com", 9), size: 9, color: MUTED });
    this.y -= 8;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y }, end: { x: this.width - MARGIN, y: this.y },
      thickness: 1.4, color: GOLD,
    });
    this.y -= 22;
  }

  title(t: string, sub?: string) {
    this.para(t, { font: this.bold, size: 17, gap: sub ? 2 : 12 });
    if (sub) this.para(sub, { size: 10, color: MUTED, gap: 14 });
  }

  /** Label: value, on one line. */
  kv(label: string, value: string) {
    this.ensure(15);
    this.text(`${label}`, { font: this.bold, size: 9.5 });
    this.text(value || "—", { x: MARGIN + 108, size: 9.5 });
    this.y -= 14;
  }

  /**
   * A table with wrapped cells and a header repeated on every page — a task log runs to several
   * pages and a page of unlabelled columns is unreadable.
   */
  table(cols: { w: number; label: string; align?: "l" | "r" | "c" }[], rows: { text: string; color?: any; font?: PDFFont }[][]) {
    const size = 9;
    const xs: number[] = [];
    let x = MARGIN;
    for (const c of cols) { xs.push(x); x += c.w; }

    const drawHead = () => {
      this.ensure(20);
      for (let i = 0; i < cols.length; i++) {
        this.text(cols[i].label, { x: xs[i], size: 8.5, font: this.bold, color: MUTED });
      }
      this.y -= 6;
      this.rule(8);
    };
    drawHead();

    for (const row of rows) {
      // Height is set by the tallest wrapped cell in the row.
      const wrapped = row.map((cell, i) => this.wrap(cell.text, cols[i].w - 8, cell.font ?? this.reg, size));
      const h = Math.max(...wrapped.map((l) => l.length)) * (size + 3) + 5;
      if (this.y - h < MARGIN + 28) { this.newPage(); drawHead(); }
      const top = this.y;
      for (let i = 0; i < row.length; i++) {
        let yy = top;
        for (const line of wrapped[i]) {
          const font = row[i].font ?? this.reg;
          let xx = xs[i];
          if (cols[i].align === "r") xx = xs[i] + cols[i].w - 8 - font.widthOfTextAtSize(pdfSafe(line), size);
          if (cols[i].align === "c") xx = xs[i] + (cols[i].w - font.widthOfTextAtSize(pdfSafe(line), size)) / 2;
          this.page.drawText(pdfSafe(line), { x: xx, y: yy, size, font, color: row[i].color ?? INK });
          yy -= size + 3;
        }
      }
      this.y = top - h;
      this.page.drawLine({
        start: { x: MARGIN, y: this.y + 4 }, end: { x: this.width - MARGIN, y: this.y + 4 },
        thickness: 0.4, color: LINE,
      });
    }
    this.y -= 8;
  }

  /** Page numbers, added once everything else is laid out. */
  paginate() {
    const pages = this.pdf.getPages();
    pages.forEach((p, i) => {
      const label = `Page ${i + 1} of ${pages.length}`;
      p.drawText(pdfSafe(label), {
        x: p.getWidth() - MARGIN - this.reg.widthOfTextAtSize(label, 8),
        y: MARGIN - 14, size: 8, font: this.reg, color: MUTED,
      });
    });
  }
}

export type Person = { name: string; email?: string | null; role?: string | null; emp_type?: string | null; start_date?: string | null };

const statusCell = (t: Task) => {
  const st = taskStatus(t);
  const color = st === "on_time" ? OK : st === "late" || st === "overdue" ? BAD : MUTED;
  return { text: STATUS_TEXT[st] || st, color };
};

function taskTable(s: Sheet, tasks: Task[]) {
  s.table(
    [
      { w: 22, label: "#" },
      { w: 187, label: "TASK" },
      { w: 84, label: "GIVEN" },
      { w: 76, label: "DEADLINE" },
      { w: 76, label: "DELIVERED" },
      { w: 58, label: "STATUS" },
    ],
    tasks.map((t) => [
      { text: String(t.seq) },
      { text: t.detail ? `${t.title}\n${t.detail}` : t.title },
      { text: fmt(t.assigned_at) + (t.source === "owner" ? "\n(assigned)" : "\n(self-set)") },
      { text: t.due_at ? fmt(t.due_at) : "—" },
      { text: t.delivered_at ? fmt(t.delivered_at) : "—" },
      statusCell(t),
    ]),
  );
}

function summaryBlock(s: Sheet, tasks: Task[]) {
  const st = workStats(tasks);
  s.para("Summary", { font: s.bold, size: 11, gap: 6 });
  s.kv("Tasks", `${st.total}   (${st.assignedByOwner} assigned, ${st.selfSet} self-set)`);
  s.kv("Delivered", `${st.delivered}${st.deliveredPct != null ? `  (${st.deliveredPct}%)` : ""}`);
  s.kv("On time", st.onTimePct != null ? `${st.onTime} of ${st.onTime + st.late} with a deadline  (${st.onTimePct}%)` : "—");
  if (st.late) s.kv("Late", String(st.late));
  if (st.overdue) s.kv("Overdue", String(st.overdue));
  if (st.pending) s.kv("Still open", String(st.pending));
  s.y -= 6;
}

/** The factual task log. No scores, no signature — anyone may download their own. */
export async function taskLogPdf(person: Person, tasks: Task[]): Promise<Uint8Array> {
  const s = await Sheet.create();
  s.header();
  s.title("Work Log", `${person.name}${person.role ? ` · ${person.role}` : ""}`);
  s.kv("Name", person.name);
  if (person.email) s.kv("Email", person.email);
  if (person.role) s.kv("Role", person.role);
  if (person.start_date) s.kv("Started", fmtDay(person.start_date));
  s.kv("Generated", fmt(new Date().toISOString()));
  s.y -= 6;
  s.rule(12);
  summaryBlock(s, tasks);
  s.rule(10);

  if (!tasks.length) s.para("No tasks recorded yet.", { color: MUTED, font: s.ital });
  else taskTable(s, tasks);

  s.y -= 4;
  s.para("This log lists tasks in the order they were recorded, with the times they were set and delivered. Times are IST.",
    { size: 8.5, color: MUTED });
  s.paginate();
  return s.pdf.save();
}

/**
 * The owner-issued performance report: the log, every weekly review, the whole-tenure score, and
 * the founder's signature.
 */
export async function performanceReportPdf(
  person: Person,
  tasks: Task[],
  reviews: Review[],
  tenure: TenureScore,
  opts: { reportId: string; issuedBy?: string } = { reportId: "" },
): Promise<Uint8Array> {
  const s = await Sheet.create();
  s.header();
  s.title("Performance Report", `${person.name}${person.role ? ` · ${person.role}` : ""}`);
  s.kv("Name", person.name);
  if (person.email) s.kv("Email", person.email);
  if (person.role) s.kv("Role", person.role);
  if (person.emp_type) s.kv("Engagement", person.emp_type);
  if (person.start_date) s.kv("Started", fmtDay(person.start_date));
  s.kv("Issued", fmt(new Date().toISOString()));
  if (opts.reportId) s.kv("Report ID", opts.reportId);
  s.y -= 6;
  s.rule(12);

  // ── Overall, first: it is what the reader is looking for ──
  s.para("Overall assessment", { font: s.bold, size: 12, gap: 8 });
  if (tenure.average == null) {
    s.para("No weekly reviews have been recorded yet, so no overall score can be given.", { color: MUTED, font: s.ital, gap: 10 });
  } else {
    s.ensure(30);
    s.text(`${tenure.average.toFixed(1)} / 5`, { font: s.bold, size: 21, color: GOLD });
    s.text(tenure.band, { x: MARGIN + 104, size: 12, font: s.bold });
    s.y -= 20;
    s.para(`Averaged across ${tenure.weeks} weekly review${tenure.weeks === 1 ? "" : "s"}. Each week counts equally.`,
      { size: 9, color: MUTED, gap: 10 });
    s.table(
      [{ w: 260, label: "CRITERION" }, { w: 70, label: "AVERAGE", align: "r" }],
      REVIEW_CRITERIA.filter((c) => tenure.perCriterion[c.id] != null).map((c) => [
        { text: c.label },
        { text: `${tenure.perCriterion[c.id].toFixed(1)} / 5`, font: s.bold },
      ]),
    );
  }

  const st = tenure.stats;
  s.para("Delivery record", { font: s.bold, size: 11, gap: 6 });
  s.kv("Tasks", `${st.total}   (${st.assignedByOwner} assigned, ${st.selfSet} self-set)`);
  s.kv("Delivered", `${st.delivered}${st.deliveredPct != null ? `  (${st.deliveredPct}%)` : ""}`);
  s.kv("On time", st.onTimePct != null ? `${st.onTime} of ${st.onTime + st.late} with a deadline  (${st.onTimePct}%)` : "—");
  s.y -= 4;
  s.rule(12);

  // ── Week by week ──
  s.para("Weekly reviews", { font: s.bold, size: 12, gap: 8 });
  if (!reviews.length) {
    s.para("None recorded.", { color: MUTED, font: s.ital, gap: 8 });
  } else {
    const ordered = [...reviews].sort((a, b) => a.week_start.localeCompare(b.week_start));
    s.table(
      [
        { w: 84, label: "WEEK OF" },
        ...REVIEW_CRITERIA.map((c) => ({ w: 52, label: SHORT[c.id] || c.label.toUpperCase(), align: "c" as const })),
        { w: 44, label: "AVG", align: "r" as const },
      ],
      ordered.map((r) => [
        { text: fmtDay(`${r.week_start}T00:00:00+05:30`) },
        ...REVIEW_CRITERIA.map((c) => ({ text: r.scores[c.id] != null ? String(r.scores[c.id]) : "—" })),
        { text: reviewAverage(r) != null ? reviewAverage(r)!.toFixed(1) : "—", font: s.bold },
      ]),
    );
    // Notes are where the useful detail lives, so they get their own block rather than a cell.
    const withNotes = ordered.filter((r) => (r.note || "").trim() || r.metrics.length);
    if (withNotes.length) {
      s.para("Notes", { font: s.bold, size: 11, gap: 6 });
      for (const r of withNotes) {
        s.para(fmtDay(`${r.week_start}T00:00:00+05:30`), { font: s.bold, size: 9.5, gap: 2 });
        if ((r.note || "").trim()) s.para(r.note!.trim(), { size: 9.5, gap: r.metrics.length ? 3 : 8 });
        for (const m of r.metrics) {
          const bits = [m.target ? `target ${m.target}` : "", m.actual ? `actual ${m.actual}` : "", m.score ? `${m.score}/5` : ""].filter(Boolean);
          s.para(`•  ${m.name}${bits.length ? ` — ${bits.join(", ")}` : ""}`, { size: 9.5, gap: 2 });
        }
        s.y -= 6;
      }
    }
  }

  s.rule(12);
  s.para("Task log", { font: s.bold, size: 12, gap: 8 });
  if (!tasks.length) s.para("No tasks recorded.", { color: MUTED, font: s.ital });
  else taskTable(s, tasks);

  // ── Signature ──
  s.ensure(96);
  s.y -= 8;
  s.para("For Avloryn Labs LLP", { size: 9.5, color: MUTED, gap: 6 });
  try {
    const bytes = await fs.readFile(path.join(process.cwd(), "public", "founder-signature.png"));
    const img = await s.pdf.embedPng(new Uint8Array(bytes));
    const scale = Math.min(165 / img.width, 66 / img.height);   // fit, never squish
    const w = img.width * scale, h = img.height * scale;
    s.ensure(h + 6);
    s.page.drawImage(img, { x: MARGIN, y: s.y - h, width: w, height: h });
    s.y -= h + 4;
  } catch {
    // No signature file on this deployment — the name and the report id still identify it.
    s.y -= 24;
  }
  s.para(opts.issuedBy || "Hardev Singh Thakur", { font: s.bold, size: 10.5, gap: 1 });
  s.para("Founder, Avloryn Labs LLP", { size: 9.5, color: MUTED, gap: 10 });
  s.para(
    `Issued ${fmt(new Date().toISOString())}${opts.reportId ? ` · Report ID ${opts.reportId}` : ""}. Scores are the founder's assessment; the task log is a system record. Times are IST.`,
    { size: 8, color: MUTED });

  s.paginate();
  return s.pdf.save();
}
