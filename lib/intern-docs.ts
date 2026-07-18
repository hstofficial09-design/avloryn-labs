// Intern onboarding — document text templates (Internship Agreement, NDA,
// Joining Letter). Text is owner-approved; bracketed fields auto-fill from the
// submitted form. Rendered into PDFs by app/api/intern-onboarding/route.ts.

export type Role = "M&C" | "P&R";

export const ROLE_LABEL: Record<Role, string> = {
  "M&C": "Marketing & Community",
  "P&R": "Product & Research",
};

export type InternData = {
  fullName: string;
  mobile: string;
  email: string;
  address: string;
  role: Role;
  startDate: string; // display string e.g. "01 Aug 2026"
  duration: string; // "3" | "6"
  idType: string; // PAN / College ID / DL / Voter ID / Passport
  idNumber?: string;
  isStudent: boolean;
  collegeName?: string;
  studentId?: string;
  signedAt: string; // ISO/display timestamp
  place?: string;
};

const COMPANY = "Avloryn Labs LLP";
const FOUNDER = "Hardev Singh Thakur";

export type Clause = { h?: string; t: string };

/** Internship Agreement — returns ordered clauses. */
export function internshipAgreement(d: InternData): {
  title: string;
  intro: string;
  clauses: Clause[];
} {
  const role = ROLE_LABEL[d.role];
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
        t: `This is an unpaid internship — no fixed stipend or salary is payable, and no employer–employee relationship is created. The Intern's earning opportunity is through the Company's Referral Program (Clause 7). Completion of this internship is not a guarantee of future employment.`,
      },
      {
        h: "3. Responsibilities",
        t: `The Intern will work on assigned tasks and projects, meet agreed deliverables, communicate professionally, and act in good faith and in the Company's interest.`,
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
      {
        h: "7. Referral Commission (Earning Opportunity)",
        t: `The Intern will be issued a unique referral code. When a customer uses this code: (a) the customer receives a 25% discount on their order, and (b) the Intern earns a commission of 10% of the net (post-discount) amount collected by the Company. Example: on a Rs.1,000 order, the customer pays Rs.750 (25% off) and the Intern earns Rs.75 (10% of Rs.750). This is the default commission rate; the Company may increase the Intern's commission percentage based on performance, at its discretion. Payouts are made as per the Company's Referral Program. This benefit also extends to permanent employees under the same Program.`,
      },
      {
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

/** Non-Disclosure Agreement — returns ordered clauses. */
export function ndaAgreement(d: InternData): {
  title: string;
  intro: string;
  clauses: Clause[];
} {
  return {
    title: "NON-DISCLOSURE AGREEMENT (NDA)",
    intro: `This Non-Disclosure Agreement is made between ${COMPANY} (the "Company") and ${d.fullName} (the "Intern").`,
    clauses: [
      {
        h: "1. Confidential Information",
        t: `Confidential Information includes (but is not limited to) the Company's and LivoDraft's product internals, code, prompts, algorithms, generation pipeline, business and financial information, pricing, user data, strategies, unreleased features, and any other non-public information.`,
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

/** Joining Letter — returns paragraphs. Referral code "shared shortly". */
export function joiningLetter(d: InternData): {
  title: string;
  paragraphs: string[];
  bullets: string[];
} {
  const role = ROLE_LABEL[d.role];
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
      `Nature: Unpaid, deliverable-based (learning-first)`,
      `Referral code: your referral code will be shared shortly — you will earn a commission on sales made through it.`,
    ],
  };
}

export const DOC_META = { COMPANY, FOUNDER };
