import type { Metadata } from "next";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { LivodraftContent } from "./livodraft-content";
import { FAQS, LIVODRAFT_SCHEMA_DESCRIPTION, LIVODRAFT_FEATURES } from "./data";
import { SITE_URL, ORG_ID, WEBSITE_ID, breadcrumbLd } from "@/lib/seo";

const DESCRIPTION =
  "An AI-assisted academic drafting studio for Indian students. Get a structured, formatted, referenced Word document built to your university's standards. Now live.";

export const metadata: Metadata = {
  // Absolute title keeps the owner-approved wording exact (no "· Avloryn Labs" suffix).
  title: { absolute: "LivoDraft — AI-assisted academic drafting studio for Indian students" },
  description: DESCRIPTION,
  alternates: { canonical: "/livodraft" },
  openGraph: {
    type: "website",
    url: "/livodraft",
    title: "LivoDraft — AI-assisted academic drafting studio for Indian students",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "LivoDraft — academic drafting studio for Indian students",
    description: DESCRIPTION,
  },
};

const softwareLd = {
  "@context": "https://schema.org",
  "@type": ["SoftwareApplication", "Product"],
  "@id": `${SITE_URL}/livodraft#software`,
  name: "LivoDraft",
  url: "https://livodraft.com/",
  // Ties this entity to the LivoDraft product entity on its own site (livodraft.com).
  sameAs: "https://livodraft.com/#app",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "AI Academic Writing Platform",
  operatingSystem: "Web browser",
  // Avloryn is the authoritative publisher (linked to the site-wide Organization entity).
  publisher: { "@id": ORG_ID, "@type": "Organization", name: "Avloryn Labs LLP", url: "https://avloryn.com" },
  provider: { "@id": ORG_ID },
  offers: { "@type": "Offer", price: "26", priceCurrency: "INR" },
  description: LIVODRAFT_SCHEMA_DESCRIPTION,
  featureList: [...LIVODRAFT_FEATURES],
};

const webPageLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": `${SITE_URL}/livodraft#webpage`,
  url: `${SITE_URL}/livodraft`,
  name: "LivoDraft — AI-assisted academic drafting studio for Indian students",
  description: DESCRIPTION,
  isPartOf: { "@id": WEBSITE_ID },
  about: { "@id": `${SITE_URL}/livodraft#software` },
  primaryImageOfPage: { "@id": `${SITE_URL}/#logo` },
  inLanguage: "en",
};

const breadcrumbLd_ = breadcrumbLd([{ name: "LivoDraft", path: "/livodraft" }]);

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function LivodraftPage() {
  return (
    <>
      <Navbar />
      <main id="main">
        <LivodraftContent />
      </main>
      <Footer />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd_) }}
      />
    </>
  );
}
