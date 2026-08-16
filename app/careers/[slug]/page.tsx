import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { getOpeningBySlug, type Opening } from "@/lib/portal-db";
import { getSession } from "@/lib/portal-auth";
import { SITE_URL, ORG_ID, WEBSITE_ID, breadcrumbLd } from "@/lib/seo";
import ApplyForm from "./apply-form";
import { JobDescription } from "@/components/careers/jd";
import { parseBlocks, blocksToHtml } from "@/lib/careers-md";

// Never cached: this page can render an owner-only preview, and a cached copy could serve that
// to the public. It also means a role appears the moment it is published.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

/** The published role, or — for a signed-in owner — whatever exists, so they can preview it. */
async function load(slug: string): Promise<{ role: Opening; preview: boolean } | null> {
  try {
    const live = await getOpeningBySlug(slug, true);
    if (live) return { role: live, preview: false };
    const any = await getOpeningBySlug(slug, false);
    if (!any) return null;
    const s = await getSession();
    if (s?.role === "owner") return { role: any, preview: true };
    // Exists but isn't open: show a real page rather than a dead end (below).
    return { role: any, preview: false };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const found = await load(slug);
  if (!found) return { title: "Role not found" };
  const r = found.role;
  const desc = r.summary || `Apply for ${r.title} at Avloryn Labs.`;
  const listed = r.status === "open";
  return {
    title: listed ? r.title : `${r.title} — closed`,
    description: desc,
    alternates: { canonical: `/careers/${r.slug}` },
    // A closed or unpublished role should drop out of search rather than rank as a live job.
    ...(listed ? {} : { robots: { index: false, follow: true } }),
    openGraph: { title: `${r.title} · Avloryn Labs`, description: desc, url: `${SITE_URL}/careers/${r.slug}` },
  };
}

/** Google Jobs understands these; anything else is ignored rather than mis-read. */
const EMPLOYMENT: Record<string, string> = {
  Internship: "INTERN",
  "Full-time": "FULL_TIME",
  "Part-time": "PART_TIME",
  Contract: "CONTRACTOR",
};

export default async function RolePage({ params }: Params) {
  const { slug } = await params;
  const found = await load(slug);
  if (!found) notFound();
  const { role: r, preview } = found;
  const closed = r.status !== "open" && !preview;

  const blocks = parseBlocks(r.description || "");
  const remote = /remote/i.test(r.work_mode || "");

  const jobLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    "@id": `${SITE_URL}/careers/${r.slug}#job`,
    title: r.title,
    // Schema wants HTML here; blocksToHtml escapes every value it emits.
    description: blocksToHtml(blocks) || `<p>${(r.summary || r.title).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`,
    datePosted: (r.created_at || new Date().toISOString()).slice(0, 10),
    employmentType: EMPLOYMENT[r.emp_type] || "OTHER",
    hiringOrganization: { "@type": "Organization", "@id": ORG_ID, name: "Avloryn Labs", sameAs: SITE_URL },
    directApply: true,
    // Google drops a posting whose validThrough has passed, so only state one that still holds.
    ...(r.apply_by && r.apply_by >= new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
      ? { validThrough: r.apply_by } : {}),
    ...(r.openings > 1 ? { totalJobOpenings: r.openings } : {}),
    ...(remote
      ? {
          jobLocationType: "TELECOMMUTE",
          applicantLocationRequirements: { "@type": "Country", name: "India" },
        }
      : {
          jobLocation: {
            "@type": "Place",
            address: { "@type": "PostalAddress", addressLocality: r.location || "India", addressCountry: "IN" },
          },
        }),
  };

  const chips = [r.emp_type, r.work_mode, r.location, r.experience, r.compensation].filter(Boolean);

  return (
    <>
      {!closed && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jobLd) }} />}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbLd([{ name: "Careers", path: "/careers" }, { name: r.title, path: `/careers/${r.slug}` }]),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            "@id": `${SITE_URL}/careers/${r.slug}#webpage`,
            url: `${SITE_URL}/careers/${r.slug}`,
            name: `${r.title} · Avloryn Labs`,
            isPartOf: { "@id": WEBSITE_ID },
            about: { "@id": ORG_ID },
            inLanguage: "en",
          }),
        }}
      />

      <Navbar />
      <main className="pt-32 sm:pt-40">
        <article className="container max-w-3xl pb-28">
          <a href="/careers" className="inline-flex items-center gap-1.5 text-[0.9rem] text-muted-foreground transition-colors hover:text-foreground">
            <span aria-hidden="true">←</span> All roles
          </a>

          {preview && (
            <div className="mt-5 rounded-2xl border border-[#e4d3a5] bg-[#fbf3dd] px-4 py-3 text-[0.86rem] text-[#7a5f16]">
              <strong className="font-[620]">Preview — not published.</strong> Only you can see this page. Publish it
              from <a href="/portal/careers" className="underline underline-offset-4">Careers</a> when it&rsquo;s ready.
            </div>
          )}

          {closed && (
            <div className="mt-5 rounded-2xl border border-border bg-muted px-4 py-3 text-[0.9rem] text-muted-foreground">
              <strong className="font-[620] text-foreground">This role is closed.</strong> We&rsquo;re no longer taking
              applications for it — <a href="/careers" className="underline underline-offset-4">see what else is open</a>.
            </div>
          )}

          <header className="mt-6 border-b border-border pb-8">
            {r.department && <p className="section-label">{r.department}</p>}
            <h1 className="mt-2 text-display font-[560] tracking-[-0.03em] text-balance">{r.title}</h1>
            {r.summary && (
              <p className="mt-4 max-w-[62ch] text-[1.02rem] leading-[1.75] text-muted-foreground text-pretty">{r.summary}</p>
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              {chips.map((c) => (
                <span key={String(c)} className="neu-chip rounded-full px-3 py-1 text-[0.78rem] font-[560] text-muted-foreground">
                  {c}
                </span>
              ))}
            </div>
            {r.apply_by && <p className="mt-4 text-[0.85rem] text-faint">Applications close {r.apply_by}</p>}
          </header>

          <JobDescription source={r.description || ""} />

          {closed ? (
            <div className="mt-14 card-lux rounded-3xl p-8 text-center">
              <h2 className="font-serif text-[1.2rem] font-[600]">Applications have closed</h2>
              <p className="mx-auto mt-2 max-w-[48ch] text-[0.95rem] leading-relaxed text-muted-foreground">
                This role isn&rsquo;t taking applications any more. You can still send us an open application —
                we keep good people in mind for what opens next.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <a href="/careers" className="btn-gold rounded-full px-5 py-2.5 text-[0.88rem] font-[600]">See open roles</a>
                <a href="/careers/general" className="text-[0.88rem] font-[560] text-muted-foreground transition-colors hover:text-foreground">
                  Send an open application →
                </a>
              </div>
            </div>
          ) : (
            <div id="apply" className="mt-14 scroll-mt-28">
              <ApplyForm slug={r.slug} title={r.title} fields={r.form_fields} disabled={preview} />
            </div>
          )}
        </article>
      </main>
      <Footer />
    </>
  );
}
