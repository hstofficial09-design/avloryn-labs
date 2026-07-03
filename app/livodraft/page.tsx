import type { Metadata } from "next";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { LivodraftContent } from "./livodraft-content";
import { FAQS } from "./data";

const SITE_URL = "https://avloryn.com";

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
  "@type": "SoftwareApplication",
  name: "LivoDraft",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  url: `${SITE_URL}/livodraft`,
  description: DESCRIPTION,
  publisher: { "@type": "Organization", name: "Avloryn Labs", url: SITE_URL },
  offers: {
    "@type": "Offer",
    availability: "https://schema.org/OnlineOnly",
    name: "Available now",
  },
};

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
    </>
  );
}
