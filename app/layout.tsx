import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";

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

const SITE_URL = "https://avloryn.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Avloryn Labs — Intelligent software products for people",
    template: "%s · Avloryn Labs",
  },
  description:
    "Avloryn Labs builds intelligent software products designed to simplify work, reduce effort, and help people focus on what truly matters. Currently building Livodraft (Private Beta).",
  applicationName: "Avloryn Labs",
  keywords: [
    "Avloryn Labs",
    "Livodraft",
    "intelligent software",
    "product company",
    "academic workflow",
  ],
  authors: [{ name: "Avloryn Labs" }],
  creator: "Avloryn Labs",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Avloryn Labs",
    title: "Avloryn Labs — Intelligent software products for people",
    description: "We build intelligent software products that work the way people do.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Avloryn Labs",
    description: "We build intelligent software products that work the way people do.",
  },
  icons: {
    icon: [
      {
        url:
          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='15' fill='%230a0a0b'/%3E%3Cpath d='M16 7a9 9 0 1 0 8.49 6' fill='none' stroke='white' stroke-width='2.4' stroke-linecap='round'/%3E%3Ccircle cx='23' cy='9' r='3.1' fill='white'/%3E%3C/svg%3E",
        type: "image/svg+xml",
      },
    ],
  },
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

const orgSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Avloryn Labs",
  url: SITE_URL,
  description:
    "Avloryn Labs builds intelligent software products designed to simplify work, reduce effort, and help people focus on what truly matters.",
  email: "hardev@avloryn.com",
  founder: { "@type": "Person", name: "Hardev Singh Thakur" },
  makesOffer: { "@type": "Offer", name: "Livodraft", category: "Software" },
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
        />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
