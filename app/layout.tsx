import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import { CookieConsent } from "@/components/analytics/cookie-consent";
import { SITE_URL, ORG_ID, WEBSITE_ID, SAME_AS } from "@/lib/seo";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const DESCRIPTION =
  "Avloryn Labs is an independent Indian software product company. We build intelligent tools that reduce effort — including LivoDraft, our AI-assisted academic drafting studio (now live).";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Avloryn Labs — Intelligent software product company",
    template: "%s · Avloryn Labs",
  },
  description: DESCRIPTION,
  applicationName: "Avloryn Labs",
  keywords: [
    "Avloryn",
    "Avloryn Labs",
    "Avloryn Labs LLP",
    "Avloryn software company",
    "LivoDraft",
    "AI academic drafting",
    "software product company India",
  ],
  authors: [{ name: "Avloryn Labs", url: SITE_URL }],
  creator: "Avloryn Labs",
  publisher: "Avloryn Labs",
  category: "technology",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Avloryn Labs",
    title: "Avloryn Labs — Intelligent software product company",
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    site: "@AvlorynLabs",
    creator: "@AvlorynLabs",
    title: "Avloryn Labs — Intelligent software product company",
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // Favicon + apple-icon are auto-detected from app/icon.png and app/apple-icon.png
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
  ],
  colorScheme: "light dark",
};

/* Prevent theme flash before hydration */
const themeScript = `(function(){try{var t=localStorage.getItem('avloryn-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

// Site-wide entity graph. One stable @id per entity, reused across every page so
// Google can resolve "Avloryn" to a single, independent brand entity.
const entityGraph = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": ORG_ID,
      name: "Avloryn Labs",
      legalName: "Avloryn Labs LLP",
      alternateName: ["Avloryn", "Avloryn Labs LLP"],
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        "@id": `${SITE_URL}/#logo`,
        url: `${SITE_URL}/avloryn-mark.png`,
        contentUrl: `${SITE_URL}/avloryn-mark.png`,
        width: 699,
        height: 621,
        caption: "Avloryn Labs",
      },
      image: { "@id": `${SITE_URL}/#logo` },
      description:
        "Avloryn Labs is an independent Indian software product company that builds intelligent tools to reduce effort — including LivoDraft, an AI-assisted academic drafting studio.",
      email: "contact@avloryn.com",
      foundingDate: "2026",
      founder: { "@type": "Person", name: "Hardev Singh Thakur" },
      address: { "@type": "PostalAddress", addressCountry: "IN" },
      contactPoint: {
        "@type": "ContactPoint",
        email: "contact@avloryn.com",
        contactType: "customer support",
        areaServed: "IN",
        availableLanguage: ["en", "hi"],
      },
      knowsAbout: [
        "AI-assisted academic writing",
        "Software product development",
        "Academic document formatting",
      ],
      sameAs: SAME_AS,
    },
    {
      "@type": "WebSite",
      "@id": WEBSITE_ID,
      url: SITE_URL,
      name: "Avloryn Labs",
      alternateName: "Avloryn",
      description: DESCRIPTION,
      publisher: { "@id": ORG_ID },
      inLanguage: "en",
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${serif.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(entityGraph) }}
        />
        <GoogleAnalytics />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>{children}</ThemeProvider>
        <CookieConsent />
      </body>
    </html>
  );
}
