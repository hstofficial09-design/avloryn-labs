import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";

/**
 * Shared frame for static long-form pages (privacy, terms).
 * Keeps the marketing nav + footer for consistency.
 */
export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main className="pt-32 sm:pt-40">
        <article className="container max-w-3xl pb-28">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-[0.9rem] text-muted-foreground transition-colors hover:text-foreground"
          >
            <span aria-hidden="true">←</span> Back to home
          </a>

          <header className="mt-6 border-b border-border pb-8">
            <h1 className="text-display font-[560] tracking-[-0.03em]">{title}</h1>
            <p className="mt-3 text-[0.9rem] text-faint">Last updated: {updated}</p>
          </header>

          <div className="legal-prose mt-10">{children}</div>
        </article>
      </main>
      <Footer />
    </>
  );
}
