/**
 * When a probation period ends.
 *
 * The period is configured against the ROLE as a finished phrase — "1 month", "6 weeks" — and the
 * person's start date is when they could first earn. Both halves are needed, and either can be
 * missing, so this returns null rather than guessing: an invented probation end would be shown as
 * fact against a real person's record.
 */
const UNITS: Record<string, "d" | "w" | "m" | "y"> = {
  day: "d", days: "d", week: "w", weeks: "w",
  month: "m", months: "m", year: "y", years: "y",
};

/** "2 weeks" from "2026-08-26" → the Date it ends. null when either half is missing or unreadable. */
export function probationEnds(startISO?: string | null, probation?: string | null): Date | null {
  const start = String(startISO || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const m = /^(\d{1,3})\s*([A-Za-z]+)$/.exec(String(probation || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = UNITS[m[2].toLowerCase()];
  if (!n || !unit) return null;

  // Built from the date parts rather than Date.parse, which reads a bare ISO date as UTC and can
  // land on the previous day once rendered in IST.
  const [y, mo, d] = start.split("-").map(Number);
  const end = new Date(y, mo - 1, d);
  if (unit === "d") end.setDate(end.getDate() + n);
  else if (unit === "w") end.setDate(end.getDate() + n * 7);
  else if (unit === "m") end.setMonth(end.getMonth() + n);
  else end.setFullYear(end.getFullYear() + n);
  return end;
}

/** What to show against a person: null when there is nothing to say. */
export function probationStatus(
  startISO?: string | null, probation?: string | null, now = new Date(),
): { ends: Date; over: boolean; label: string } | null {
  const ends = probationEnds(startISO, probation);
  if (!ends) return null;
  const on = ends.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  // Compared by day, not by instant: a probation ending today is not yet over.
  const over = new Date(now.getFullYear(), now.getMonth(), now.getDate()) > ends;
  return { ends, over, label: over ? `Probation ended ${on}` : `Probation ends ${on}` };
}
