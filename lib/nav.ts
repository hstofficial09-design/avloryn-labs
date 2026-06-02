// Route-aware hashes so the nav also works from /privacy, /terms, etc.
export const NAV_LINKS = [
  { label: "Philosophy", href: "/#philosophy" },
  { label: "Product", href: "/#product" },
  { label: "Vision", href: "/#vision" },
  { label: "Values", href: "/#values" },
  { label: "Story", href: "/#story" },
  { label: "Journal", href: "/blog" },
] as const;

export const SECTION_IDS = [
  "hero",
  "philosophy",
  "product",
  "vision",
  "values",
  "story",
  "contact",
] as const;
