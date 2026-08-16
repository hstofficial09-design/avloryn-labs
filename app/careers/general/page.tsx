import type { Metadata } from "next";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { generalFields } from "@/lib/careers-fields";
import { SITE_URL, ORG_ID, WEBSITE_ID, breadcrumbLd } from "@/lib/seo";
import ApplyForm from "../[slug]/apply-form";

export const metadata: Metadata = {
  title: "Open application",
  description:
    "Nothing open that fits? Send Avloryn Labs an open application and we'll keep you in mind for what opens next.",
  alternates: { canonical: "/careers/general" },
  openGraph: { title: "Open application · Avloryn Labs", url: `${SITE_URL}/careers/general` },
};

export default function GeneralApplicationPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            "@id": `${SITE_URL}/careers/general#webpage`,
            url: `${SITE_URL}/careers/general`,
            name: "Open application · Avloryn Labs",
            isPartOf: { "@id": WEBSITE_ID },
            about: { "@id": ORG_ID },
            inLanguage: "en",
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbLd([{ name: "Careers", path: "/careers" }, { name: "Open application", path: "/careers/general" }]),
          ),
        }}
      />

      <Navbar />
      <main className="pt-32 sm:pt-40">
        <article className="container max-w-3xl pb-28">
          <a href="/careers" className="inline-flex items-center gap-1.5 text-[0.9rem] text-muted-foreground transition-colors hover:text-foreground">
            <span aria-hidden="true">←</span> All roles
          </a>

          <header className="mt-6 border-b border-border pb-8">
            <p className="section-label">Open application</p>
            <h1 className="mt-2 text-display font-[560] tracking-[-0.03em] text-balance">
              Nothing open that fits?
            </h1>
            <p className="mt-4 max-w-[62ch] text-[1.02rem] leading-[1.75] text-muted-foreground text-pretty">
              Tell us what you&rsquo;re good at anyway. We&rsquo;re small and we hire in bursts — several people here
              wrote before there was a listing. A real note about real work beats a perfectly matched CV.
            </p>
          </header>

          <div className="mt-12">
            <ApplyForm general slug="" title="an open application" fields={generalFields()} />
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
