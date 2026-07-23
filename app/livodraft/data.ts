// Rich, owner-approved LivoDraft description. Single source for the visible page copy
// (/livodraft + homepage product section) AND the JSON-LD — so AI engines and readers
// see one consistent, authoritative description of the product (published by Avloryn).
export const LIVODRAFT_OVERVIEW =
  `LivoDraft turns a student's own research into a submission-ready, India-format thesis, ` +
  `dissertation, research paper or review. It reads your topic, objectives, methodology, ` +
  `findings and up to ~100 of your own reference PDFs, then writes a complete multi-chapter ` +
  `draft of 8–300 pages across 9+ document types and cites it with real DOI-verified references ` +
  `(Crossref) in 6 styles. Formatting is UGC/AICTE/Shodhganga-compliant and degree-aware, ` +
  `delivered as an editable Word (.docx) file plus LaTeX/Overleaf and Shodhganga export. The ` +
  `“Make It Yours” workspace guides you to rewrite generic passages in your own words, and a ` +
  `fidelity-enforcer keeps your real data exact so it never invents your results. An honest AI ` +
  `research-to-thesis assistant with an AI-use disclosure certificate — not a detector-evasion tool.`;

// Shorter description used inside the SoftwareApplication JSON-LD.
export const LIVODRAFT_SCHEMA_DESCRIPTION =
  `LivoDraft turns a student's own research into a submission-ready, India-format thesis with ` +
  `real DOI-verified references, 9+ document types (8-300 pages), 6 citation styles, and editable ` +
  `Word + LaTeX export. Made by Avloryn Labs.`;

// featureList for the SoftwareApplication JSON-LD.
export const LIVODRAFT_FEATURES = [
  "9+ document types: thesis, dissertation, MTech/PhD thesis, research paper, synopsis, systematic review (PRISMA), literature review, case study, journal article",
  "Complete multi-chapter drafts from 8 to 300 pages out of your own research inputs",
  "Reads up to ~100 of your own reference PDFs and drafts from your material — never invents your results",
  "DOI-verified references via Crossref (no fabricated citations)",
  "6 citation styles: APA, MLA, IEEE, Harvard, Chicago, Vancouver",
  "UGC / AICTE / Shodhganga compliant, degree-aware formatting",
  "Exports editable Word (.docx), LaTeX / Overleaf, and Shodhganga split-file package",
  "Make It Yours guided revision + AI-use disclosure certificate",
  "Citation Studio, Complete My Thesis, and examiner-style Panel Review tools",
] as const;

// Shared between the visible FAQ render (client) and the FAQPage JSON-LD (server).
// Keep wording verbatim with DEVELOPER_PLAN.md §3.2 (owner-approved).
export const FAQS = [
  {
    q: "Is LivoDraft free?",
    a: "LivoDraft is live at livodraft.com, where you'll find current pricing and any launch offers.",
  },
  {
    q: "Which documents can it create?",
    a: "Thesis, dissertation, research paper, project report, synopsis, research proposal, and reviews.",
  },
  {
    q: "Does it work for my degree?",
    a: "Yes — from BTech and BSc up to PhD.",
  },
  {
    q: "Can I edit the document?",
    a: "Yes. You get a fully editable Word (.docx) file.",
  },
  {
    q: "Is it built for Indian universities?",
    a: "Yes. It follows Indian academic formatting standards.",
  },
  {
    q: "How do I start?",
    a: "Head to livodraft.com and create your document. Questions? Use the contact form.",
  },
  {
    q: "Is my work private?",
    a: "Yes. Your details and your documents stay yours.",
  },
] as const;
