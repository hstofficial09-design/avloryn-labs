import { Resend } from "resend";
import { listTeamForMail, claimBirthdaySend, releaseBirthdaySend } from "./portal-db";
import { dobMonthDay, istToday, isPlaceholderPerson, isTeamMember } from "./birthdays";

/**
 * The birthday emails: one to the person, one to everybody else.
 *
 * Two rules shape the whole thing.
 *
 * It must never send twice. An employer wishing you a happy birthday twice in one morning reads as
 * broken, so every send is claimed in the database before it goes out and released again only if
 * it fails. The job can then run every hour, from two servers, and still send once.
 *
 * It must never send at the wrong time. Sending is held until 09:00 India time, worked out from
 * India's clock rather than the server's — Railway runs in UTC, where 09:00 is the middle of the
 * Indian afternoon.
 */

/** India's hour of the day, 0-23. */
function istHour(now = new Date()): number {
  return +new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(now);
}
/** YYYY-MM-DD in India — the key everything is claimed against. */
function istDateKey(now = new Date()): string {
  const t = istToday(now);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
const firstName = (n: string) => n.trim().split(/\s+/)[0] || n.trim();

/** Names as a sentence: "Asha", "Asha and Bilal", "Asha, Bilal and Chetan". */
export function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] || "";
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

export type Person = { name: string; email: string; dob: string | null; kind: string | null };
export type Plan = {
  date: string;
  /** Whose birthday it is today. */
  celebrants: Person[];
  /** Everyone who gets told about it. */
  audience: Person[];
  greeting: { subject: string; text: (p: Person) => string };
  team: { subject: string; text: string };
};

/**
 * Who gets what, today.
 *
 * The team is the people who came through the onboarding form. A network partner is an outside
 * recruiter: no greeting, no announcement, not on the board either. Their email is on file so they
 * can be paid, and their date of birth is not the company's to circulate.
 */
export function planFor(people: Person[], now = new Date()): Plan | null {
  const today = istToday(now);
  const m = today.getMonth() + 1, d = today.getDate();

  const real = people.filter((p) => p.name && p.email && !isPlaceholderPerson(p.name) && isTeamMember(p.kind));
  const celebrants = real.filter((p) => {
    const md = dobMonthDay(p.dob);
    // Same rules as the board: a birth year of this year or later is not a date of birth.
    return !!md && md.m === m && md.d === d && md.y < today.getFullYear();
  });
  if (!celebrants.length) return null;

  const celebrantEmails = new Set(celebrants.map((c) => c.email.toLowerCase()));
  // Partners are already gone from `real`; the check stays as the second lock on the one thing
  // here that must never be got wrong.
  const audience = real.filter((p) => p.kind !== "partner" && !celebrantEmails.has(p.email.toLowerCase()));

  const names = celebrants.map((c) => c.name);
  const firsts = celebrants.map((c) => firstName(c.name));
  const one = celebrants.length === 1;

  return {
    date: istDateKey(now),
    celebrants,
    audience,
    greeting: {
      subject: "Happy birthday!",
      // Written to one person, whoever opens it.
      text: (p) => `Hi ${firstName(p.name)},

Happy birthday from all of us at Avloryn Labs.

Thank you for the work you put in. We hope you get a proper break today, and that the year ahead is a good one for you.

Have a lovely day.

— The Avloryn Labs team`,
    },
    team: {
      subject: one ? `It's ${firsts[0]}'s birthday today` : `Birthdays today: ${nameList(firsts)}`,
      // Nobody's pronouns are recorded anywhere, so nothing here assumes any.
      text: `Hi,

${one ? `It's ${names[0]}'s birthday today.` : `It's ${nameList(names)}'s birthdays today.`}

Do send ${one ? "them" : "them all"} a message and wish ${one ? "them" : "them"} well.

— The Avloryn Labs team`,
    },
  };
}

export type SendResult = {
  ran: boolean; reason?: string; date?: string;
  celebrants?: string[]; greetings?: number; announcements?: number; skipped?: number; errors?: string[];
};

/**
 * Send today's birthday mail.
 *
 * `preview` builds the whole plan and sends nothing — the way to see what a real run would do
 * without doing it. `force` ignores the 09:00 hold, for the same reason.
 */
export async function runBirthdayMail(opts: { now?: Date; preview?: boolean; force?: boolean } = {}): Promise<SendResult & { plan?: Plan }> {
  const now = opts.now || new Date();
  const SEND_HOUR = 9;
  if (!opts.preview && !opts.force && istHour(now) < SEND_HOUR) {
    return { ran: false, reason: `holding until ${SEND_HOUR}:00 IST` };
  }

  let people: Person[];
  try { people = await listTeamForMail(); }
  catch (e: any) { return { ran: false, reason: "could not read the team: " + (e?.message || "error") }; }

  const plan = planFor(people, now);
  if (!plan) return { ran: false, reason: "no birthdays today", date: istDateKey(now) };
  if (opts.preview) {
    return { ran: false, reason: "preview", date: plan.date, plan,
             celebrants: plan.celebrants.map((c) => c.name), greetings: plan.celebrants.length, announcements: plan.audience.length };
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) return { ran: false, reason: "no RESEND_API_KEY", date: plan.date };
  const from = process.env.CONTACT_FROM_EMAIL || "Avloryn Labs <onboarding@resend.dev>";
  const resend = new Resend(key);
  const errors: string[] = [];
  let greetings = 0, announcements = 0, skipped = 0;

  // Claim, then send, and give the claim back if the send fails so the next run retries it.
  const deliver = async (to: string, kind: string, subject: string, text: string) => {
    if (!(await claimBirthdaySend(plan.date, to, kind))) { skipped++; return; }
    try {
      // A birthday wish from a no-reply address invites a "thanks!" that lands nowhere. The from
      // address is shared with every other portal email, so the reply path is set here instead.
      await resend.emails.send({ from, to, subject, text, replyTo: process.env.CONTACT_REPLY_TO || "contact@avloryn.com" });
      return true;
    } catch (e: any) {
      errors.push(`${kind} → ${to}: ${e?.message || "send failed"}`);
      await releaseBirthdaySend(plan.date, to, kind).catch(() => {});
      return false;
    }
  };

  for (const c of plan.celebrants) {
    if (await deliver(c.email, "greeting", plan.greeting.subject, plan.greeting.text(c))) greetings++;
  }
  for (const a of plan.audience) {
    if (await deliver(a.email, "team", plan.team.subject, plan.team.text)) announcements++;
  }

  return { ran: true, date: plan.date, celebrants: plan.celebrants.map((c) => c.name),
           greetings, announcements, skipped, ...(errors.length ? { errors } : {}) };
}
