/**
 * Single source of truth for entity SEO identifiers.
 *
 * ORG_ID / WEBSITE_ID are stable @id URIs reused in the JSON-LD on EVERY page so
 * Google resolves "Avloryn" to one independent brand entity (not a misspelling of
 * another word). SAME_AS are the real, verified social profiles that corroborate
 * the entity across the web — the strongest brand-disambiguation signal.
 */
export const SITE_URL = "https://avloryn.com";

export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

export const SAME_AS = [
  "https://www.linkedin.com/company/124884054/",
  "https://x.com/AvlorynLabs",
  "https://www.instagram.com/avloryn_labs/",
  "https://www.youtube.com/channel/UCfuyB0d1ilYkoUjlSJklq7w",
  "https://www.facebook.com/profile.php?id=61590542071920",
];

/** Helper: a BreadcrumbList for an inner page (Home › …crumbs). */
export function breadcrumbLd(
  crumbs: { name: string; path: string }[]
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      ...crumbs.map((c, i) => ({
        "@type": "ListItem",
        position: i + 2,
        name: c.name,
        item: `${SITE_URL}${c.path}`,
      })),
    ],
  };
}
