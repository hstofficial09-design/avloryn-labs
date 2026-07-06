import type { MetadataRoute } from "next";

// Web app manifest — reinforces the brand name ("Avloryn Labs" / short "Avloryn")
// to crawlers and browsers. Served at /manifest.webmanifest and auto-linked by Next.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Avloryn Labs",
    short_name: "Avloryn",
    description:
      "Avloryn Labs is an independent Indian software product company — makers of LivoDraft, an AI-assisted academic drafting studio.",
    start_url: "/",
    display: "browser",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "en",
    categories: ["productivity", "education", "business"],
    icons: [
      {
        src: "/avloryn-mark.png",
        sizes: "699x621",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
