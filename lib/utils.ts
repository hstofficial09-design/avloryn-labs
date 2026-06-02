/**
 * Minimal class-name combiner. Filters falsy values and joins with spaces.
 * Kept dependency-free on purpose.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
