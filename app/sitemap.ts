import type { MetadataRoute } from "next";
import { sanityFetch } from "@/sanity/lib/fetch";
import { SLUGS_QUERY } from "@/sanity/lib/queries";
import { listOpenings } from "@/lib/portal-db";

const SITE_URL = "https://avloryn.com";

// Stable last-modified for the hand-built static pages. Bump this only when one of
// those pages meaningfully changes — a real, honest lastmod signal beats "now" on
// every crawl (which Google learns to distrust).
const STATIC_UPDATED = new Date("2026-08-01");

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs =
    (await sanityFetch<{ slug: string; _updatedAt?: string; publishedAt?: string }[]>(SLUGS_QUERY, {}, [])) ?? [];

  const postDate = (s: { _updatedAt?: string; publishedAt?: string }) =>
    s._updatedAt ? new Date(s._updatedAt) : s.publishedAt ? new Date(s.publishedAt) : STATIC_UPDATED;

  const posts: MetadataRoute.Sitemap = slugs.map((s) => ({
    url: `${SITE_URL}/blog/${s.slug}`,
    lastModified: postDate(s),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  // The blog index changes whenever the newest post does.
  const newestPost = slugs.length
    ? new Date(Math.max(...slugs.map((s) => postDate(s).getTime())))
    : STATIC_UPDATED;

  // Each open role gets its own entry — a job page Google never crawls can never reach Google Jobs.
  let openRoles: { slug: string; updated_at?: string; created_at?: string }[] = [];
  try { openRoles = await listOpenings({ publicOnly: true }); } catch { /* sitemap must still build */ }
  const roleDate = (r: { updated_at?: string; created_at?: string }) =>
    new Date(r.updated_at || r.created_at || STATIC_UPDATED);
  const roles: MetadataRoute.Sitemap = openRoles.map((r) => ({
    url: `${SITE_URL}/careers/${r.slug}`,
    lastModified: roleDate(r),
    changeFrequency: "weekly",
    priority: 0.8,
  }));
  const newestRole = openRoles.length
    ? new Date(Math.max(...openRoles.map((r) => roleDate(r).getTime())))
    : STATIC_UPDATED;

  return [
    { url: `${SITE_URL}/`, lastModified: STATIC_UPDATED, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/livodraft`, lastModified: STATIC_UPDATED, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/blog`, lastModified: newestPost, changeFrequency: "weekly", priority: 0.8 },
    ...posts,
    { url: `${SITE_URL}/careers`, lastModified: newestRole, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/careers/general`, lastModified: STATIC_UPDATED, changeFrequency: "monthly", priority: 0.4 },
    ...roles,
    { url: `${SITE_URL}/privacy`, lastModified: STATIC_UPDATED, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: STATIC_UPDATED, changeFrequency: "yearly", priority: 0.3 },
  ];
}
