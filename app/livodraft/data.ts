// Shared between the visible FAQ render (client) and the FAQPage JSON-LD (server).
// Keep wording verbatim with DEVELOPER_PLAN.md §3.2 (owner-approved).
export const FAQS = [
  {
    q: "Is LivoDraft free?",
    a: "LivoDraft is in Private Beta. Request early access for an invitation.",
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
    q: "How do I become an early tester?",
    a: "Request early access on this page. We're inviting a small group during Private Beta.",
  },
  {
    q: "Is my work private?",
    a: "Yes. Your details and your documents stay yours.",
  },
] as const;
