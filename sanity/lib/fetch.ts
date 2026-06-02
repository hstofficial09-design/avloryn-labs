import { client } from "@/sanity/lib/client";
import { isSanityConfigured } from "@/sanity/env";

/**
 * Guarded fetch. Returns the fallback (default null) when Sanity isn't
 * configured yet, or when a query fails — so the build never crashes and
 * the blog simply renders empty until a project + posts exist.
 */
export async function sanityFetch<T>(
  query: string,
  params: Record<string, unknown> = {},
  fallback: T | null = null
): Promise<T | null> {
  if (!isSanityConfigured) return fallback;
  try {
    return await client.fetch<T>(query, params);
  } catch (err) {
    console.error("[sanity] fetch failed:", err);
    return fallback;
  }
}
