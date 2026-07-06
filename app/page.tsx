import { Preloader } from "@/components/layout/preloader";
import { ScrollProgress } from "@/components/layout/scroll-progress";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Hero } from "@/components/sections/hero";
import { Philosophy } from "@/components/sections/philosophy";
import { Product } from "@/components/sections/product";
import { Vision } from "@/components/sections/vision";
import { Values } from "@/components/sections/values";
import { Story } from "@/components/sections/story";
import { Contact } from "@/components/sections/contact";
import { SITE_URL, ORG_ID, WEBSITE_ID } from "@/lib/seo";

// Homepage WebPage node — ties this page to the site-wide Organization + WebSite
// entities (defined in app/layout.tsx) via their stable @id.
const webPageLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": `${SITE_URL}/#webpage`,
  url: `${SITE_URL}/`,
  name: "Avloryn Labs — Intelligent software product company",
  description:
    "Avloryn Labs is an independent Indian software product company. We build intelligent tools that reduce effort — including LivoDraft, our AI-assisted academic drafting studio.",
  isPartOf: { "@id": WEBSITE_ID },
  about: { "@id": ORG_ID },
  primaryImageOfPage: { "@id": `${SITE_URL}/#logo` },
  inLanguage: "en",
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageLd) }}
      />
      <Preloader />
      <ScrollProgress />
      <Navbar />
      <main id="main">
        <Hero />
        <Philosophy />
        <Product />
        <Vision />
        <Values />
        <Story />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
