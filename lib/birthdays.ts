/**
 * Whose birthday is next.
 *
 * Pure, so it can be tested without a database and rendered without a round trip. The only rule
 * that matters here: a birthday is a DAY AND MONTH, never a year. Showing the year would put
 * everybody's age on a screen the whole team can see, which is not what anybody asked for when
 * they filled in a date of birth on a joining form.
 */
export type BirthdayPerson = { name: string; dob?: string | null; kind?: string | null };

/**
 * A network partner is not on the team.
 *
 * They are outside recruiters who never filled in an onboarding form — the team is the people who
 * did. Their date of birth is not the company's to put on a shared board, and their address is on
 * file so they can be paid. Applied here, in the one function both the board and the mail use, so
 * neither can drift from the other.
 */
export const isTeamMember = (kind?: string | null) => (kind || "") !== "partner";
export type Upcoming = {
  name: string;
  /** Days from today. 0 = today. */
  days: number;
  /** The date it falls on this time round. */
  on: Date;
  /** "Today", "Tomorrow", or "Fri 12 Sept". */
  label: string;
  /** "12 September" — the birthday itself, no year. */
  date: string;
  kind?: string | null;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A stored date of birth, as month and day.
 *
 * Two formats are in the column: ISO from the form, and display text ("16 Aug 2005") from early
 * records. Both are read here rather than assuming the normalisation ran, because a date that
 * cannot be read must drop out silently — a birthday shown on the wrong day is worse than one not
 * shown at all.
 */
export function dobMonthDay(dob?: string | null): { y: number; m: number; d: number } | null {
  const s = String(dob || "").trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) {
    const y = +iso[1], m = +iso[2], d = +iso[3];
    return m >= 1 && m <= 12 && d >= 1 && d <= 31 ? { y, m, d } : null;
  }
  const txt = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/.exec(s);
  if (txt) {
    const m = MONTHS.indexOf(txt[2].slice(0, 3).toLowerCase()) + 1;
    const d = +txt[1], y = +txt[3];
    return m >= 1 && d >= 1 && d <= 31 ? { y, m, d } : null;
  }
  return null;
}

/**
 * A placeholder account rather than a person.
 *
 * Test logins carry real-looking rows — a name, an email somebody actually owns, a date of birth
 * the form accepted. Announcing "It's tester's birthday today" on every dashboard is bad; emailing
 * a stranger at that address to wish them many happy returns is worse. Matched on the NAME as a
 * whole word, so a surname that merely contains the letters is untouched.
 */
export function isPlaceholderPerson(name?: string | null): boolean {
  return /(^|[^a-z])(test|tester|testing|demo|dummy|sample)([^a-z]|$)/i.test(String(name || ""));
}

const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());

/**
 * Today, as India sees it.
 *
 * The server runs in UTC, so between midnight and 05:30 IST its own date is still yesterday's.
 * A birthday board built on that would wish people a day late every single time, for everybody,
 * and only in the early hours — the kind of wrong that is easy to miss and impossible to explain.
 */
export function istToday(now = new Date()): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * The next time a given day-and-month comes round, counting today as itself.
 *
 * 29 February is kept as a real case rather than dropped: in a non-leap year it is marked on
 * 1 March, so somebody born on the 29th is still wished within the year.
 */
export function nextOccurrence(m: number, d: number, now: Date): Date {
  const today = startOfDay(now);
  const make = (y: number) => {
    const dt = new Date(y, m - 1, d);
    // 29 Feb in a common year rolls into March by itself; keep it on the 1st rather than the 2nd.
    return dt.getMonth() === m - 1 ? dt : new Date(y, 2, 1);
  };
  const thisYear = make(today.getFullYear());
  return thisYear >= today ? thisYear : make(today.getFullYear() + 1);
}

/** The next `limit` birthdays, today first. People with no readable date of birth are left out. */
export function upcomingBirthdays(people: BirthdayPerson[], now = istToday(), limit = 6): Upcoming[] {
  const today = startOfDay(now);
  const out: Upcoming[] = [];
  const seen = new Set<string>();
  for (const p of people || []) {
    const name = String(p?.name || "").trim();
    const md = dobMonthDay(p?.dob);
    if (!name || !md || isPlaceholderPerson(name) || !isTeamMember(p.kind)) continue;
    // Nobody working here was born this year. Test accounts get whatever date the form accepted
    // — the demo partner's says 2026 — and "It's Demo Partner (test login)'s birthday today" on
    // everybody's dashboard is not the kind of thing you want to explain afterwards.
    if (md.y >= today.getFullYear()) continue;
    // The owner appears in their own profile table as well as, sometimes, the employee list.
    const key = name.toLowerCase() + "|" + md.m + "-" + md.d;
    if (seen.has(key)) continue;
    seen.add(key);
    const on = nextOccurrence(md.m, md.d, today);
    const days = Math.round((on.getTime() - today.getTime()) / 86400000);
    out.push({
      name, days, on, kind: p.kind ?? null,
      label: days === 0 ? "Today" : days === 1 ? "Tomorrow"
        : on.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
      date: on.toLocaleDateString("en-IN", { day: "numeric", month: "long" }),
    });
  }
  out.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));
  return out.slice(0, Math.max(0, limit));
}
