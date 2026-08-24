// Intern onboarding — document text templates (Internship Agreement, NDA,
// Joining Letter). Text is owner-approved; bracketed fields auto-fill from the
// submitted form. Rendered into PDFs by app/api/onboarding-form/route.ts.

export type Role = "M&C" | "P&R" | "HR";

export const ROLE_LABEL: Record<Role, string> = {
  "M&C": "Marketing & Community",
  "P&R": "Product & Research",
  "HR": "Human Resources",
};
// Roles are dynamic now — accept any label/code. These normalise it.
export const roleLabel = (r: string) => ROLE_LABEL[r as Role] || r;
export const isHrRole = (r: string) => r === "HR" || r === "Human Resources";
/** "<Role> Intern" — but never "Business Development Intern Intern": the owner can name a
 *  role with "Intern" already in it, so only append when it isn't there already. */
export const roleTitle = (r: string) => {
  const l = roleLabel(r);
  return /\bintern\b\s*$/i.test(l) ? l : `${l} Intern`;
};

export type InternData = {
  fullName: string;
  mobile: string;
  email: string;
  address: string;
  role: string; // role label or code (dynamic)
  startDate: string; // display string e.g. "01 Aug 2026"
  duration: string; // "2" | "3" | "6"
  idType: string; // PAN / College ID / DL / Voter ID / Passport
  idNumber?: string;
  isStudent: boolean;
  collegeName?: string;
  studentId?: string;
  signedAt: string; // ISO/display timestamp
  place?: string;
  /**
   * What this role actually does, as the owner wrote it against the role.
   *
   * The editor has offered this for a long time, labelled "shown in the agreement" — and it was
   * saved, length-checked, and then read by nothing. Whoever filled it in was writing into a void.
   */
  scope?: string | null;
  paid?: boolean;
  salary?: number | null;
  salaryPeriod?: string | null; // 'monthly' | 'yearly'
  /** Role is marked "Handles sensitive data" — adds an extra NDA clause. */
  sensitive?: boolean;
};

const COMPANY = "Avloryn Labs LLP";
const FOUNDER = "Hardev Singh Thakur";

/**
 * What the letterhead has to carry.
 *
 * Section 21 of the LLP Act 2008 requires every LLP's invoices, official correspondence and
 * publications to bear its name, the address of its registered office, its registration number
 * (LLPIN) and a statement that it is registered with limited liability. A joining letter is
 * official correspondence, so it needs all four. The penalty for leaving them off is Rs 10,000.
 *
 * "Designated Partner" — not "Director". An LLP has partners and designated partners; directors
 * belong to companies. Signing as a director of an LLP names an office that does not exist.
 */
// The registered office as the partners write it. MCA's master data records the tehsil as
// "Bhota, Barsar"; the postal address is Teh. Bhoranj, which is what goes on correspondence.
//
// Broken at a chosen point rather than left to wrap: at letterhead size the address runs just
// past one line, and a greedy wrap strands the PIN code on a line of its own.
const REGD_OFFICE_LINES = [
  "C/o Sanjeev Kumar Thakur, Village Rathwani, P.O. Town Bharari,",
  "Teh. Bhoranj, Distt. Hamirpur, Himachal Pradesh - 176041",
];
const REGD_OFFICE = REGD_OFFICE_LINES.join(" ");
const LLPIN = process.env.LLPIN || "ACY-9473";
const LIMITED_LIABILITY = "Registered with limited liability";

/** Both designated partners on the register (DPIN 11756970 and 11756969), either of whom signs
 *  for the LLP. */
const SIGNATORIES = [
  { name: "Hardev Singh Thakur", title: "Designated Partner", sig: "founder-signature.png" },
  { name: "Sanjeev Kumar Thakur", title: "Designated Partner", sig: "sanjeev-signature.png" },
];

export type Clause = { h?: string; t: string };

/** Internship Agreement — returns ordered clauses. HR interns get a role-specific
 *  set (no referral-commission clause — they are not part of the commission program). */
export function internshipAgreement(d: InternData): {
  title: string;
  intro: string;
  clauses: Clause[];
} {
  const isHR = isHrRole(d.role);
  return {
    title: "INTERNSHIP AGREEMENT",
    intro: `This Internship Agreement is made between ${COMPANY} (the "Company") and ${d.fullName} (the "Intern").`,
    clauses: [
      {
        h: "1. Role & Duration",
        t: `The Intern joins as a ${roleTitle(d.role)}, working remotely, for ${d.duration} months starting ${d.startDate}. The internship is deliverable-based — no fixed daily hours are mandated.`
          + ((d.scope || "").trim() ? ` Responsibilities: ${(d.scope || "").trim().replace(/\s+/g, " ")}` : ""),
      },
      {
        h: "2. Nature of Internship",
        t: (d.paid && d.salary)
          ? `This is a paid role. The Company will pay ₹${Number(d.salary).toLocaleString("en-IN")} per ${d.salaryPeriod === "yearly" ? "year" : "month"} for the agreed work, subject to the Company's policies. Completion is not a guarantee of continued or future engagement.`
          : isHR
            ? `This is an unpaid internship — no stipend or salary is payable, and no employer–employee relationship is created. It is a learning-first internship focused on hands-on experience in recruitment, talent acquisition, and HR operations. Completion of this internship is not a guarantee of future employment.`
            : `This is an unpaid internship — no fixed stipend or salary is payable, and no employer–employee relationship is created. The Intern's earning opportunity is through the Company's Referral Program (Clause 7). Completion of this internship is not a guarantee of future employment.`,
      },
      {
        h: "3. Responsibilities",
        t: isHR
          ? `The Intern will assist with the Company's hiring and HR operations, including: sourcing and screening candidates across hiring platforms; scheduling and coordinating interviews; supporting the end-to-end recruitment and hiring process; maintaining recruitment trackers and candidate databases; and supporting employer-branding and other HR initiatives. The Intern will meet agreed deliverables, communicate professionally, and act in good faith and in the Company's interest.`
          : `The Intern will work on assigned tasks and projects, meet agreed deliverables, communicate professionally, and act in good faith and in the Company's interest.`,
      },
      {
        h: "4. Intellectual Property",
        t: `All work, content, code, designs, research, and materials the Intern creates for the Company during the internship are the sole property of ${COMPANY}. The Intern assigns all such rights to the Company.`,
      },
      {
        h: "5. Confidentiality",
        t: `The Intern will keep all Company and product information confidential, as detailed in the accompanying Non-Disclosure Agreement.`,
      },
      {
        h: "6. Conduct",
        t: `The Intern will represent the Company professionally, follow its brand and communication guidelines, and will not post or share anything on the Company's behalf without prior approval.`,
      },
      isHR
        ? {
            h: "7. What the Intern Receives",
            t: `This is an unpaid internship; in place of a stipend, it provides: hands-on, mentored training in recruitment, talent acquisition, employer branding, and HR operations; the opportunity to work on live hiring projects with real responsibilities; weekly mentorship and feedback sessions with the Founder; a resume and LinkedIn profile review; access to HR resources, recruitment templates, SOPs, interview frameworks, and learning materials; flexible working hours; and priority consideration for future paid opportunities at the Company.`,
          }
        : {
            h: "7. Referral Commission (Earning Opportunity)",
            t: `The Intern will be issued a unique referral code. When a customer uses this code: (a) the customer receives a 25% discount on their order, and (b) the Intern earns a commission of 10% of the net (post-discount) amount collected by the Company. Example: on a Rs.1,000 order, the customer pays Rs.750 (25% off) and the Intern earns Rs.75 (10% of Rs.750). This is the default commission rate; the Company may increase the Intern's commission percentage based on performance, at its discretion. Payouts are made as per the Company's Referral Program. This benefit also extends to permanent employees under the same Program.`,
          },
      isHR
        ? {
            h: "8. Certificate & Recommendation",
            t: `On successful completion of the internship term, the Intern receives an Internship Completion Certificate. Outstanding performers may additionally receive a Letter of Recommendation, a LinkedIn recommendation, and first preference for future paid roles — at the Company's discretion, not guaranteed. An Intern who leaves or discontinues before completing the term will not be eligible for the certificate, recommendation, or other benefits.`,
          }
        : {
            h: "8. Certificate & Recommendation",
            t: `A minimum of 3 months of completed internship is required to be eligible for the Internship Completion Certificate. An Intern who leaves or discontinues before completing 3 months will not be eligible for any certificate, letter of recommendation, or other benefits. On successful completion of at least 3 months, the Intern receives an Internship Completion Certificate; standout performers may also receive a Letter of Recommendation and first preference for future paid roles — at the Company's discretion, not guaranteed.`,
          },
      {
        h: "9. Termination",
        t: `Either party may end the internship with reasonable notice. The Company may end it immediately for misconduct, breach of confidentiality, or non-performance.`,
      },
      {
        h: "10. Records & Consent",
        t: `The Intern consents to the Company collecting and securely storing the submitted details and documents for verification and records.`,
      },
      {
        h: "11. Governing Law",
        t: `This agreement is governed by the laws of India.`,
      },
    ],
  };
}

/** Non-Disclosure Agreement — returns ordered clauses. HR interns additionally
 *  cover candidate/recruitment data (applicant personal information). */
export function ndaAgreement(d: InternData): {
  title: string;
  intro: string;
  clauses: Clause[];
} {
  const isHR = isHrRole(d.role);
  // Built unnumbered then numbered below, so an extra clause can be inserted without
  // the headings drifting out of sequence.
  const body: Clause[] = [
    {
      h: "Confidential Information",
      t: isHR
        ? `Confidential Information includes (but is not limited to) the Company's and LivoDraft's product internals, business and financial information, pricing, user data, strategies, unreleased features, and — in the course of HR work — all candidate and recruitment data, including applicants' personal information, resumes, contact details, and evaluations, and any other non-public information.`
        : `Confidential Information includes (but is not limited to) the Company's and LivoDraft's product internals, code, prompts, algorithms, generation pipeline, business and financial information, pricing, user data, strategies, unreleased features, and any other non-public information.`,
    },
    {
      h: "Obligations",
      t: `The Intern will (a) keep all Confidential Information strictly secret, (b) use it only for internship work, (c) not copy, share, publish, screenshot, or disclose it to anyone, and (d) not use it for personal benefit or any competing purpose.`,
    },
    {
      h: "Return / Deletion",
      t: `On completion or termination, the Intern will return or delete all Confidential Information and Company materials.`,
    },
    {
      h: "Intellectual Property",
      t: `All work product remains the Company's property, as per the Internship Agreement.`,
    },
    {
      h: "Duration",
      t: `These confidentiality obligations continue after the internship ends and survive its termination.`,
    },
    {
      h: "Breach",
      t: `Any breach may result in immediate termination and appropriate legal action.`,
    },
  ];
  if (d.sensitive) body.push(sensitiveClause());
  body.push({
    h: "Governing Law",
    t: `This agreement is governed by the laws of India.`,
  });
  return {
    title: "NON-DISCLOSURE AGREEMENT (NDA)",
    intro: `This Non-Disclosure Agreement is made between ${COMPANY} (the "Company") and ${d.fullName} (the "Intern").`,
    clauses: numberClauses(body),
  };
}

/** The extra obligation a role marked "Handles sensitive data" takes on. Kept separate so it
 *  can also be appended to an NDA the owner has rewritten themselves. */
export function sensitiveClause(): Clause {
  return {
    h: "Handling of Sensitive Data",
    t: `This role handles sensitive personal data (which may include candidate, applicant, customer, or employee information). The Intern will access such data only where it is necessary for assigned work; will not download, copy, or store it on personal devices, personal accounts, or any third-party tool without written approval; will not share it with anyone inside or outside the Company who does not need it for the same work; will delete or return it as soon as the work requiring it is complete; and will report any suspected loss, unauthorised access, or accidental disclosure to the Company immediately.`,
  };
}

/** Renumber a clause list "1., 2., 3. …" so inserting a clause never breaks the sequence. */
export function numberClauses(list: Clause[]): Clause[] {
  return list.map((c, i) => (c.h ? { ...c, h: `${i + 1}. ${c.h.replace(/^\d+[.)]\s*/, "")}` } : c));
}

/** Append the sensitive-data clause to an NDA the owner has rewritten, continuing their
 *  own numbering when their clause headings are numbered. */
export function withSensitiveClause(content: { title: string; intro: string; clauses: Clause[] }) {
  const c = sensitiveClause();
  let max = 0;
  for (const cl of content.clauses) {
    const m = /^(\d+)[.)]/.exec((cl.h || "").trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return { ...content, clauses: [...content.clauses, { ...c, h: max ? `${max + 1}. ${c.h}` : c.h }] };
}

/** Joining Letter — returns paragraphs + bullets. Commission-track interns get a
 *  referral-code line; HR interns get their benefits line instead. */
export function joiningLetter(d: InternData): {
  title: string;
  paragraphs: string[];
  bullets: string[];
} {
  const isHR = isHrRole(d.role);
  return {
    title: "Internship Joining Letter",
    paragraphs: [
      `Dear ${d.fullName},`,
      `We are pleased to welcome you to ${COMPANY} as a ${roleTitle(d.role)}. We were impressed by your application and look forward to working with you.`,
      `Your internship details:`,
    ],
    bullets: [
      `Role: ${roleTitle(d.role)}`,
      `Start date: ${d.startDate}`,
      `Duration: ${d.duration} months`,
      `Location: Remote / Work from Home`,
      isHR
        ? `Nature: Unpaid, learning-first — hands-on experience in recruitment & HR operations`
        : `Nature: Unpaid, deliverable-based (learning-first)`,
      isHR
        ? `On completion: an Internship Completion Certificate; standout performers also receive a Letter of Recommendation, a LinkedIn recommendation, and priority for future paid roles.`
        : `Referral code: your referral code will be shared shortly — you will earn a commission on sales made through it.`,
    ],
  };
}

/**
 * The joining letter as EDITABLE TEXT, and the reverse: text back into a letter.
 *
 * `joiningLetter` above builds one from a fixed template that says "Internship Joining Letter" and
 * "Unpaid, deliverable-based" whoever is joining — so an Employee received an intern's letter, and
 * a Consultant would have too. The owner edits this per role now, exactly as they already edit the
 * agreement, and the bracketed fields fill in per hire.
 */
export function defaultJoiningLetterText(d: InternData, kindLabel = "Internship"): string {
  const jl = joiningLetter(d);
  const intern = kindLabel.toLowerCase().includes("intern");
  const title = intern ? "Internship Joining Letter" : `${kindLabel} Joining Letter`;
  // The closing paragraphs used to be printed by the PDF itself, AFTER whatever the owner had
  // written — so a carefully written Employment letter still ended with "on completion of your
  // internship you will receive an Internship Completion Certificate". They belong to the letter,
  // where they can be read and changed like every other line of it.
  const closing = intern
    ? (isHrRole(d.role)
        ? "On successful completion of your internship, you will receive an Internship Completion Certificate. Outstanding performers will also receive a Letter of Recommendation, a LinkedIn recommendation, and first preference for future paid roles."
        : "On successful completion (a minimum of 3 months is required), you will receive an Internship Completion Certificate. An intern who leaves before completing 3 months is not eligible for a certificate or any other benefit. Standout performers will also receive a Letter of Recommendation and first preference for future paid roles.")
    : `On successful completion you will receive a Certificate of ${kindLabel}.`;
  return [
    title, ...jl.paragraphs, ...jl.bullets.map((b) => "• " + b),
    closing,
    `This offer is subject to your signed ${kindLabel} Agreement and NDA (attached).`,
  ].join("\n\n");
}

/** Text (owner-edited or default) → the pieces the PDF draws. */
export function parseJoiningLetter(text: string, d: InternData): { title: string; paragraphs: string[]; bullets: string[]; closing: string[] } {
  const filled = fillPlaceholders(text, d).replace(/\r/g, "").trim();
  const blocks = filled.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const title = blocks.shift() || "Joining Letter";
  const paragraphs: string[] = [];   // before the list
  const bullets: string[] = [];
  const closing: string[] = [];      // after it
  let seenBullet = false;
  for (const b of blocks) {
    // A block may itself be a run of bullet lines, so split before deciding.
    for (const line of b.split("\n").map((l) => l.trim()).filter(Boolean)) {
      if (/^[•\-*]\s*/.test(line)) { bullets.push(line.replace(/^[•\-*]\s*/, "")); seenBullet = true; }
      else if (seenBullet) closing.push(line);   // anything after the list closes the letter
      else paragraphs.push(line);
    }
  }
  return { title, paragraphs, bullets, closing };
}

export const DOC_META = { COMPANY, FOUNDER, REGD_OFFICE, REGD_OFFICE_LINES, LLPIN, LIMITED_LIABILITY, SIGNATORIES };

// ── Read-only text of the CURRENT NDA + terms, for the Onboarding Form editor ──
/** A stand-in hire for previewing a role's documents in the editor (placeholders, not real data). */
export function sampleDataFor(track: string): InternData {
  const s = sampleData(isHrRole(track) ? "HR" : "M&C");
  s.role = (track as Role) || s.role;
  return s;
}

function sampleData(roleCode: Role): InternData {
  return { fullName: "[Full Name]", mobile: "[Mobile]", email: "[Email]", address: "[Address]", role: roleCode, startDate: "[Start Date]", duration: "[Duration]", idType: "[ID]", isStudent: false, signedAt: "[Date]" };
}
function toText(doc: { title: string; intro: string; clauses: Clause[] }): string {
  return `${doc.title}\n\n${doc.intro}\n\n` + doc.clauses.map((c) => (c.h ? `${c.h}\n` : "") + c.t).join("\n\n");
}
/** The current Internship-Agreement / terms text for a role (bracketed placeholders auto-fill per hire). */
export function defaultTermsText(roleLabel: string, isHR: boolean, paid = false, salary: number | null = null, salaryPeriod: string | null = null, scope: string | null = null): string {
  const code: Role = isHR ? "HR" : "M&C";
  const s = sampleData(code);
  s.paid = paid; s.salary = salary; s.salaryPeriod = salaryPeriod; s.scope = scope;
  let t = toText(internshipAgreement(s));
  if (!isHR && roleLabel && roleLabel !== ROLE_LABEL["M&C"]) t = t.split(ROLE_LABEL["M&C"]).join(roleLabel);
  return t;
}
/** The current standard NDA text (same for every role). */
export function standardNdaText(): string {
  return toText(ndaAgreement(sampleData("M&C")));
}
/** Fill [bracketed] placeholders in an owner-edited terms text with the hire's data. */
export function fillPlaceholders(text: string, d: InternData): string {
  return text
    .split("[Full Name]").join(d.fullName)
    .split("[Intern Name]").join(d.fullName)
    .split("[Name]").join(d.fullName)
    .split("[Role]").join(roleLabel(d.role))
    .split("[Duration]").join(d.duration)
    .split("[Start Date]").join(d.startDate)
    .split("[Email]").join(d.email)
    .split("[Mobile]").join(d.mobile)
    .split("[Address]").join(d.address)
    .split("[ID]").join(d.idType)
    .split("[Date]").join(d.signedAt)
    // What the role actually does, as written against it in the editor. Without this, the
    // Responsibilities field only reached the built-in template — so a kind with its own agreement
    // could never say what its roles do, and one agreement could not serve two different roles.
    .split("[Responsibilities]").join((d.scope || "").trim() || "as agreed with the Company")
    .split("[Company]").join(COMPANY);
}
/** Parse an owner-edited terms text back into title + intro + clauses for the PDF. */
export function parseTermsToContent(text: string, d: InternData): { title: string; intro: string; clauses: Clause[] } {
  const filled = fillPlaceholders(text, d).replace(/\r/g, "").trim();
  const blocks = filled.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const title = blocks.shift() || "INTERNSHIP AGREEMENT";
  let intro = "";
  if (blocks.length && !/^\d+[.)]\s/.test(blocks[0])) intro = blocks.shift()!;
  const clauses: Clause[] = blocks.map((b) => {
    const nl = b.indexOf("\n");
    if (nl > -1 && /^\d+[.)]\s/.test(b)) return { h: b.slice(0, nl).trim(), t: b.slice(nl + 1).trim() };
    return { t: b };
  });
  return { title, intro, clauses };
}
