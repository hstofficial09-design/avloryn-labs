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
  paid?: boolean;
  salary?: number | null;
  salaryPeriod?: string | null; // 'monthly' | 'yearly'
};

const COMPANY = "Avloryn Labs LLP";
const FOUNDER = "Hardev Singh Thakur";

export type Clause = { h?: string; t: string };

/** Internship Agreement — returns ordered clauses. HR interns get a role-specific
 *  set (no referral-commission clause — they are not part of the commission program). */
export function internshipAgreement(d: InternData): {
  title: string;
  intro: string;
  clauses: Clause[];
} {
  const role = roleLabel(d.role);
  const isHR = isHrRole(d.role);
  return {
    title: "INTERNSHIP AGREEMENT",
    intro: `This Internship Agreement is made between ${COMPANY} (the "Company") and ${d.fullName} (the "Intern").`,
    clauses: [
      {
        h: "1. Role & Duration",
        t: `The Intern joins as a ${role} Intern, working remotely, for ${d.duration} months starting ${d.startDate}. The internship is deliverable-based — no fixed daily hours are mandated.`,
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
  return {
    title: "NON-DISCLOSURE AGREEMENT (NDA)",
    intro: `This Non-Disclosure Agreement is made between ${COMPANY} (the "Company") and ${d.fullName} (the "Intern").`,
    clauses: [
      {
        h: "1. Confidential Information",
        t: isHR
          ? `Confidential Information includes (but is not limited to) the Company's and LivoDraft's product internals, business and financial information, pricing, user data, strategies, unreleased features, and — in the course of HR work — all candidate and recruitment data, including applicants' personal information, resumes, contact details, and evaluations, and any other non-public information.`
          : `Confidential Information includes (but is not limited to) the Company's and LivoDraft's product internals, code, prompts, algorithms, generation pipeline, business and financial information, pricing, user data, strategies, unreleased features, and any other non-public information.`,
      },
      {
        h: "2. Obligations",
        t: `The Intern will (a) keep all Confidential Information strictly secret, (b) use it only for internship work, (c) not copy, share, publish, screenshot, or disclose it to anyone, and (d) not use it for personal benefit or any competing purpose.`,
      },
      {
        h: "3. Return / Deletion",
        t: `On completion or termination, the Intern will return or delete all Confidential Information and Company materials.`,
      },
      {
        h: "4. Intellectual Property",
        t: `All work product remains the Company's property, as per the Internship Agreement.`,
      },
      {
        h: "5. Duration",
        t: `These confidentiality obligations continue after the internship ends and survive its termination.`,
      },
      {
        h: "6. Breach",
        t: `Any breach may result in immediate termination and appropriate legal action.`,
      },
      {
        h: "7. Governing Law",
        t: `This agreement is governed by the laws of India.`,
      },
    ],
  };
}

/** Joining Letter — returns paragraphs + bullets. Commission-track interns get a
 *  referral-code line; HR interns get their benefits line instead. */
export function joiningLetter(d: InternData): {
  title: string;
  paragraphs: string[];
  bullets: string[];
} {
  const role = roleLabel(d.role);
  const isHR = isHrRole(d.role);
  return {
    title: "Internship Joining Letter",
    paragraphs: [
      `Dear ${d.fullName},`,
      `We are pleased to welcome you to ${COMPANY} as a ${role} Intern. We were impressed by your application and look forward to working with you.`,
      `Your internship details:`,
    ],
    bullets: [
      `Role: ${role} Intern`,
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

export const DOC_META = { COMPANY, FOUNDER };

// ── Read-only text of the CURRENT NDA + terms, for the Onboarding Form editor ──
function sampleData(roleCode: Role): InternData {
  return { fullName: "[Full Name]", mobile: "[Mobile]", email: "[Email]", address: "[Address]", role: roleCode, startDate: "[Start Date]", duration: "[Duration]", idType: "[ID]", isStudent: false, signedAt: "[Date]" };
}
function toText(doc: { title: string; intro: string; clauses: Clause[] }): string {
  return `${doc.title}\n\n${doc.intro}\n\n` + doc.clauses.map((c) => (c.h ? `${c.h}\n` : "") + c.t).join("\n\n");
}
/** The current Internship-Agreement / terms text for a role (bracketed placeholders auto-fill per hire). */
export function defaultTermsText(roleLabel: string, isHR: boolean, paid = false, salary: number | null = null, salaryPeriod: string | null = null): string {
  const code: Role = isHR ? "HR" : "M&C";
  const s = sampleData(code);
  s.paid = paid; s.salary = salary; s.salaryPeriod = salaryPeriod;
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
    .split("[Role]").join(roleLabel(d.role))
    .split("[Duration]").join(d.duration)
    .split("[Start Date]").join(d.startDate)
    .split("[Email]").join(d.email)
    .split("[Mobile]").join(d.mobile)
    .split("[Address]").join(d.address)
    .split("[ID]").join(d.idType)
    .split("[Date]").join(d.signedAt)
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
