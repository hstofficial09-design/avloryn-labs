/**
 * Sanity environment. Public values (project id / dataset) are exposed via
 * NEXT_PUBLIC_* so both the Studio and the read client can use them.
 * `isSanityConfigured` lets the app degrade gracefully (empty blog, no crash)
 * until Hardev creates a Sanity project and sets these.
 */
export const apiVersion =
  process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2024-12-01";

export const dataset =
  process.env.NEXT_PUBLIC_SANITY_DATASET || "production";

export const projectId =
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "placeholder";

/** True only when a real project id has been provided. */
export const isSanityConfigured =
  !!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
