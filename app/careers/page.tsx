import type { Metadata } from "next";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { listOpenings, type Opening } from "@/lib/portal-db";
import { SITE_URL, ORG_ID, WEBSITE_ID, breadcrumbLd } from "@/lib/seo";

// Not cached: publishing or closing a role has to show immediately, and a stale list is
// worse than a database read on a page this quiet.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Careers",
  description:
    "Open roles at Avloryn Labs — an independent Indian software product company building intelligent tools that reduce effort.",
  alternates: { canonical: "/careers" },
  openGraph: {
    title: "Careers · Avloryn Labs",
    description: "Open roles at Avloryn Labs.",
    url: `${SITE_URL}/careers`,
  },
};

async function openings(): Promise<Opening[]> {
  // A database hiccup must not take the page down — it just shows no roles.
  try {
    return await listOpenings({ publicOnly: true });
  } catch {
    return [];
  }
}

export default async function CareersPage() {
  const roles = await openings();

  const pageLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${SITE_URL}/careers#webpage`,
    url: `${SITE_URL}/careers`,
    name: "Careers · Avloryn Labs",
    description: "Open roles at Avloryn Labs.",
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": ORG_ID },
    inLanguage: "en",
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd([{ name: "Careers", path: "/careers" }])) }} />
      <Navbar />
      <main className="pt-32 sm:pt-40">
        <section className="container pb-24">
          <p className="section-label">Careers</p>
          <h1 className="mt-3 max-w-[18ch] text-display font-[560] tracking-[-0.03em] text-balance">
            Build things that reduce effort.
          </h1>
          <p className="mt-5 max-w-[60ch] text-[1.02rem] leading-[1.75] text-muted-foreground text-pretty">
            We&rsquo;re a small, independent product company. You&rsquo;ll own real work early, see it
            reach real users, and get told plainly how it landed.
          </p>

          <div className="mt-14">
            {roles.length === 0 ? (
              <div className="card-lux rounded-3xl p-8 sm:p-10">
                <h2 className="font-serif text-[1.25rem] font-[600]">No open roles right now</h2>
                <p className="mt-2 max-w-[52ch] text-[0.95rem] leading-relaxed text-muted-foreground">
                  Nothing is open at the moment — but we hire in bursts, and several people here wrote
                  before there was a listing. Tell us what you&rsquo;re good at and we&rsquo;ll keep you in mind.
                </p>
                <a href="/careers/general" className="btn-gold mt-6 inline-block rounded-full px-5 py-2.5 text-[0.88rem] font-[600]">
                  Send an open application
                </a>
              </div>
            ) : (
              <>
                <p className="section-label mb-4">
                  {roles.length} open {roles.length === 1 ? "role" : "roles"}
                </p>
                <ul className="grid gap-4">
                  {roles.map((r) => (
                    <li key={r.id} className="card-lux card-lux-hover rounded-3xl p-6 sm:p-7">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h2 className="font-serif text-[1.2rem] font-[600] tracking-[-0.01em]">{r.title}</h2>
                          {r.department && <p className="mt-0.5 text-[0.8rem] text-faint">{r.department}</p>}
                        </div>
                        {r.openings > 1 && (
                          <span className="shrink-0 rounded-full bg-gold-soft/60 px-3 py-1 text-[0.72rem] font-[600] uppercase tracking-[0.1em] text-gold">
                            {r.openings} openings
                          </span>
                        )}
                      </div>

                      {r.summary && (
                        <p className="mt-3 max-w-[64ch] text-[0.93rem] leading-relaxed text-muted-foreground text-pretty">
                          {r.summary}
                        </p>
                      )}

                      <div className="mt-4 flex flex-wrap gap-2">
                        {[r.emp_type, r.work_mode, r.location, r.experience, r.compensation]
                          .filter(Boolean)
                          .map((chip) => (
                            <span key={String(chip)} className="neu-chip rounded-full px-3 py-1 text-[0.76rem] font-[560] text-muted-foreground">
                              {chip}
                            </span>
                          ))}
                      </div>

                      <div className="mt-6 flex flex-wrap items-center gap-3">
                        <a href={`/careers/${r.slug}#apply`} className="btn-gold rounded-full px-5 py-2.5 text-[0.88rem] font-[600]">
                          Apply for this role
                        </a>
                        <a href={`/careers/${r.slug}`} className="text-[0.88rem] font-[560] text-muted-foreground transition-colors hover:text-foreground">
                          Read the full description →
                        </a>
                        {r.apply_by && <span className="text-[0.78rem] text-faint">Closes {r.apply_by}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {roles.length > 0 && (
            <p className="mt-10 text-[0.93rem] text-muted-foreground">
              None of these quite you?{" "}
              <a href="/careers/general" className="text-gold font-[560] hover:underline">Send an open application</a>{" "}
              — we keep good people in mind for what opens next.
            </p>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
