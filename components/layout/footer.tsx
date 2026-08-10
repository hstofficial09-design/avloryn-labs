import { LogoMark } from "@/components/ui/logo";

const FOOTER_LINKS = [
  { label: "Philosophy", href: "/#philosophy" },
  { label: "Product", href: "/#product" },
  { label: "LivoDraft", href: "/livodraft" },
  { label: "Vision", href: "/#vision" },
  { label: "Journal", href: "/blog" },
  { label: "Contact", href: "/#contact" },
];

const LEGAL_LINKS = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Partner Portal", href: "/portal" },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-subtle">
      <div className="container py-16">
        <div className="flex flex-col items-start justify-between gap-10 md:flex-row md:items-center">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5 text-foreground">
              <LogoMark size={24} />
              <span className="text-[1.05rem] font-[560] tracking-[-0.02em]">
                Avloryn Labs
              </span>
            </div>
            <p className="mt-4 text-[1.35rem] font-serif italic text-muted-foreground">
              Building products for people.
            </p>
          </div>

          <nav aria-label="Footer" className="flex flex-wrap gap-x-7 gap-y-3">
            {FOOTER_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-[0.95rem] text-muted-foreground transition-colors hover:text-foreground"
              >
                {l.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-border pt-7 text-[0.85rem] text-faint sm:flex-row sm:items-center">
          <p>© {year} Avloryn Labs LLP</p>
          <nav aria-label="Legal" className="flex items-center gap-5">
            {LEGAL_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="transition-colors hover:text-foreground">
                {l.label}
              </a>
            ))}
            <span className="hidden tracking-[0.02em] sm:inline">Building products for people.</span>
          </nav>
        </div>
      </div>
    </footer>
  );
}
