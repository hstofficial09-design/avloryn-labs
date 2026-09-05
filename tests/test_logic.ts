/**
 * The decisions that move real things.
 *
 * These functions are the ones that reschedule meetings, decide whether work was delivered on
 * time, and produce the score on a signed performance report. Each case below is either a bug we
 * actually hit or the rule that stops it coming back.
 *
 * Run:  npx tsx tests/test_logic.ts
 */
import { decideNewTime } from "../lib/booking/sync";
import { hostOrder } from "../lib/booking/google";
import { taskStatus, workStats, reviewAverage, tenureScore, weekStartIST, tasksInWeek, type Task, type Review } from "../lib/portal-db";
import { shouldAlert, type Tracked } from "../lib/monitor/state";
import { roleLabel } from "../lib/role-label";
import { fillPlaceholders, tidySpan } from "../lib/intern-docs";
import { probationEnds, probationStatus } from "../lib/probation";
import { upcomingBirthdays, dobMonthDay, nextOccurrence, istToday, isPlaceholderPerson } from "../lib/birthdays";
import { planFor, nameList } from "../lib/birthday-mail";
import { regKeyFrom } from "../lib/portal-db";
import { shouldSignOut } from "../lib/session-ended";
import { stillIgnored, beatChecks } from "../lib/monitor/state";

let pass = 0;
const fails: string[] = [];
const ok = (cond: boolean, label: string, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fails.push(label); console.log(`  ✗ ${label}${extra ? "  — " + extra : ""}`); }
};

const iso = (h: number) => new Date(Date.UTC(2026, 7, 21, h, 0, 0)).toISOString();
const booking = (start: string) => ({ start_utc: start, end_utc: start } as any);

console.log("\n── which calendar copy wins a sync ──");
{
  // The bug: a reschedule reached the database and Google, the Zoho leg didn't land, and the next
  // cron read the copy left behind as "somebody moved it" — dragging the meeting back.
  const decision = decideNewTime(booking(iso(14)), [
    { memberId: "google", startISO: iso(14), updatedAt: iso(13) },  // our write — newest
    { memberId: "zoho", startISO: iso(11), updatedAt: iso(9) },     // stale, left behind
  ], "google");
  ok(decision === null, "a stale copy does NOT undo a reschedule");
}
{
  // Someone genuinely drags their copy: theirs is the most recently touched, so it must propagate.
  const decision = decideNewTime(booking(iso(14)), [
    { memberId: "google", startISO: iso(14), updatedAt: iso(9) },
    { memberId: "zoho", startISO: iso(17), updatedAt: iso(16) },    // dragged just now
  ], "google");
  ok(decision?.startISO === iso(17), "a genuine drag DOES propagate", String(decision?.startISO));
  ok(decision?.movedBy === "zoho", "…and we know who moved it");
}
{
  const decision = decideNewTime(booking(iso(14)), [
    { memberId: "a", startISO: iso(17), updatedAt: null },          // age unknown
  ], "a");
  ok(decision === null, "a copy whose age we cannot read never wins — guessing here moves meetings");
}
{
  const decision = decideNewTime(booking(iso(14)), [
    { memberId: "a", startISO: new Date(Date.parse(iso(14)) + 30_000).toISOString(), updatedAt: iso(16) },
  ], "a");
  ok(decision === null, "half a minute of drift is rounding, not a reschedule");
}

console.log("\n── who hosts the meeting ──");
{
  // The host's Google event creates the Meet link, so someone whose calendar lives in Zoho is a
  // poor first choice — but a chosen organizer outranks that. "Make me the organizer" was losing
  // exactly here: the choice went to the front, then the Zoho-last rule pushed it back, and the
  // owner works in Zoho, so the person who picked themselves was always the one demoted.
  const zoho = new Set(["owner"]);
  ok(hostOrder(["a", "owner", "b"], zoho, "owner")[0] === "owner",
     "a chosen organizer hosts even when their calendar is Zoho",
     hostOrder(["a", "owner", "b"], zoho, "owner")[0]);
  ok(hostOrder(["owner", "a"], zoho, null)[0] === "a",
     "with nobody chosen, a Google calendar is tried first");
  ok(hostOrder(["a", "b"], new Set<string>(), "nobody")[0] === "a",
     "an organizer who is not attending is ignored rather than inserted");
  ok(hostOrder(["a", "owner", "b"], zoho, "owner").length === 3,
     "nobody is dropped from the running order");
  ok(hostOrder(["x"], new Set<string>(), null).join() === "x", "a single member is simply the host");
}

console.log("\n── on time, late, overdue ──");
const task = (o: Partial<Task>): Task => ({
  id: "t", employee_id: "e", seq: 1, title: "t", detail: null, source: "owner",
  assigned_at: iso(9), due_at: null, done_at: null, delivered_at: null, ...o,
});
ok(taskStatus(task({ due_at: iso(14), delivered_at: iso(13) })) === "on_time", "delivered before the deadline is on time");
ok(taskStatus(task({ due_at: iso(14), delivered_at: iso(15) })) === "late", "delivered after it is late");
ok(taskStatus(task({ due_at: iso(9) }), Date.parse(iso(14))) === "overdue", "deadline gone by with nothing delivered is overdue");
ok(taskStatus(task({ due_at: iso(20) }), Date.parse(iso(14))) === "pending", "deadline still ahead is simply pending");
ok(taskStatus(task({ delivered_at: iso(14) })) === "no_deadline", "no deadline means it can never be late");

console.log("\n── what the numbers say ──");
{
  const st = workStats([
    task({ id: "1", due_at: iso(14), delivered_at: iso(13) }),   // on time
    task({ id: "2", due_at: iso(14), delivered_at: iso(15) }),   // late
    task({ id: "3", delivered_at: iso(15) }),                    // delivered, no deadline
    task({ id: "4", due_at: iso(20) }),                          // still open
  ], Date.parse(iso(16)));
  ok(st.delivered === 3, "counts everything delivered", String(st.delivered));
  ok(st.onTimePct === 50, "on-time % is of tasks that HAD a deadline, not of everything", String(st.onTimePct));
  ok(st.total === 4 && st.pending === 1, "and the rest still shows as open");
}

console.log("\n── the score on a signed report ──");
const review = (week: string, s: Record<string, number>): Review => ({
  id: week, employee_id: "e", week_start: week, scores: s, metrics: [], note: null,
  created_at: "", updated_at: "",
});
{
  const r = review("2026-08-17", { completion: 4, quality: 5, timeliness: 3, communication: 4, ownership: 4 });
  ok(reviewAverage(r) === 4, "a week's average is the mean of its criteria", String(reviewAverage(r)));
}
{
  // A quiet week must not count for less than a busy one — the score is about how someone worked.
  const t = tenureScore([
    review("2026-08-10", { completion: 5, quality: 5, timeliness: 5, communication: 5, ownership: 5 }),
    review("2026-08-17", { completion: 3, quality: 3, timeliness: 3, communication: 3, ownership: 3 }),
  ], []);
  ok(t.average === 4, "every week counts equally", String(t.average));
  ok(t.band === "Exceeds expectations", "the band is worded from the score", t.band);
  ok(t.weeks === 2, "and it says how many weeks it is based on");
}
ok(tenureScore([], []).average === null && tenureScore([], []).band === "Not yet reviewed",
   "with no reviews it says so rather than inventing a score");

console.log("\n── when the watchdog is allowed to interrupt you ──");
{
  // Being heard is the whole job. Emailing every failure on every hourly run teaches you to skim
  // past the subject line, and then the one that actually matters is skimmed past too. So: once
  // when it breaks, then only at a day, three days, a week — each one saying plainly that nobody
  // has touched it. Acknowledging stops the reminders without hiding the fault.
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const t = (o: Partial<Tracked>): Tracked => ({
    id: "c", app: "Avloryn", title: "c", ok: false, severity: "critical", detail: "",
    first_failed_at: null, last_ok_at: null, last_alert_at: null, ack_at: null, ack_by: null,
    brokenHours: 0, acknowledged: false, ...o,
  } as Tracked);

  ok(shouldAlert(t({ ok: true })).alert === false, "a passing check never emails");
  ok(shouldAlert(t({})).alert === true, "a brand-new failure emails immediately");
  ok(shouldAlert(t({ last_alert_at: hoursAgo(1), brokenHours: 1 })).alert === false,
     "the same failure an hour later does NOT email again");
  ok(shouldAlert(t({ last_alert_at: hoursAgo(23), brokenHours: 23 })).alert === false,
     "…nor after most of a day");
  ok(shouldAlert(t({ last_alert_at: hoursAgo(25), brokenHours: 25 })).alert === true,
     "…but at a day it says so again");
  ok(shouldAlert(t({ last_alert_at: hoursAgo(50), brokenHours: 75 })).stage === 2,
     "…and three days in, louder", String(shouldAlert(t({ last_alert_at: hoursAgo(50), brokenHours: 75 })).stage));
  ok(shouldAlert(t({ brokenHours: 200, last_alert_at: hoursAgo(100) })).stage === 3,
     "…a week in, loudest");
  ok(shouldAlert(t({ acknowledged: true, ack_at: hoursAgo(1), brokenHours: 300 })).alert === false,
     "'I'm on it' stops the reminders even when it has been broken for weeks");
  // A check that stopped being able to run is itself a fault. Treating unknown as fine is how a
  // watchdog goes quiet at exactly the moment you needed it.
  ok(shouldAlert(t({ ok: null })).alert === true, "a check that could not run is treated as broken, never as fine");
}

console.log("\n── what we call somebody ──");
{
  // This label was hand-written in seven files. When network partners arrived, one of the seven
  // learned about them and a Campus Ambassador was shown as "Employee" everywhere else.
  ok(roleLabel({ emp_type: "partner", role: "Campus Ambassador" }) === "Campus Ambassador",
     "a partner is called what they actually are, not 'Employee'");
  ok(roleLabel({ emp_type: "partner", role: "" }) === "Network Partner",
     "…and 'Network Partner' only when nothing was recorded");
  ok(roleLabel({ emp_type: "partner", role: "Influencer", track: "Marketing" }) === "Influencer",
     "a partner's kind wins over any track left on the row");
  ok(roleLabel({ emp_type: "intern", track: "Business Development Intern" }) === "Intern · Business Development Intern",
     "an intern shows their track");
  ok(roleLabel({ emp_type: "intern", track: "X" }, { withTrack: false }) === "Intern",
     "…unless the space is too tight for it");
  ok(roleLabel({ emp_type: "employee" }) === "Employee", "everyone else is an employee");
  ok(roleLabel({ emp_type: "partner", role: "Campus Ambassador" }, { isOwner: true }) === "Owner",
     "the owner is the owner whatever the row says");
  ok(roleLabel(null) === "Employee" && roleLabel(undefined) === "Employee",
     "a missing row never renders as blank or 'undefined'");
  // The owner can add kinds of their own. This runs client-side with no database, and a kind can
  // be archived while people still hold it, so the label comes from the key.
  ok(roleLabel({ emp_type: "consultant" }) === "Consultant", "a kind the owner invented is named properly");
  ok(roleLabel({ emp_type: "part_time_writer" }) === "Part Time Writer", "…including a multi-word one");
  ok(roleLabel({ emp_type: "volunteer" }) !== "Employee",
     "an unknown kind is never mislabelled as Employee — that is the bug this replaced");
}

console.log("\n── adding a kind of person ──");
{
  ok(regKeyFrom("Consultant") === "consultant", "a typed name becomes a stable key");
  ok(regKeyFrom("Part-time Writer") === "part_time_writer", "punctuation and spaces collapse");
  ok(regKeyFrom("  Volunteer  ") === "volunteer", "stray spacing does not become part of the key");
  ok(regKeyFrom("!!!") === "", "a name with nothing usable in it yields no key, rather than a junk one");
  // Nothing is reserved any more — the owner decides what the form offers. What still matters is
  // that a key is always derivable, since it is what lands in employees.emp_type.
  ok(regKeyFrom("Network Partner") === "network_partner", "any label the owner types produces a usable key");
  ok(regKeyFrom("Partner") === "partner", "…including one that carries partner behaviour, which is the owner's call");
}

console.log("\n── a reminder is sent because it is still useful, not because the cron was punctual ──");
{
  // The old rule only sent a reminder if the run landed within 20 minutes of the offset, which
  // assumed a punctual scheduler. Measured, a "every 15 minutes" job ran every 50 on average and
  // once left a five-hour gap — so most reminders fell between runs and were silently skipped.
  const MIN_USEFUL_LEAD = 10;
  const send = (minsToMeeting: number, offset: number, alreadySent: number[] = []) => {
    const crossed = [offset].filter((o) => !alreadySent.includes(o) && minsToMeeting <= o);
    return crossed.filter(() => minsToMeeting >= MIN_USEFUL_LEAD).length > 0;
  };
  ok(send(118, 120) === true, "a run right on time sends it");
  ok(send(65, 120) === true, "a run an hour late still sends it — that is the whole point");
  ok(send(15, 120) === true, "…even very late, while there is still time to read it");
  ok(send(5, 120) === false, "but not once the meeting is minutes away — that is noise, not a reminder");
  ok(send(-30, 120) === false, "and never after the meeting has started");
  ok(send(118, 120, [120]) === false, "one already sent is never sent twice");
  ok(send(200, 120) === false, "and nothing goes out before its time");
}

console.log("\n── what the documents fill in ──");
{
  const d = (o: any = {}) => ({ fullName:"Asha", role:"M&C", startDate:"01 Sep 2026", duration:"3",
    email:"a@b.c", mobile:"9", address:"x", idType:"PAN", isStudent:false, signedAt:"today", ...o } as any);

  ok(fillPlaceholders("Dear [Full Name], from [Start Date].", d()) === "Dear Asha, from 01 Sep 2026.",
     "the ordinary fields fill in");
  ok(fillPlaceholders("Duties: [Responsibilities]", d({ scope: "Write content." })) === "Duties: Write content.",
     "a role's responsibilities reach the agreement");
  ok(/as agreed with the Company/.test(fillPlaceholders("Duties: [Responsibilities]", d())),
     "…and read sensibly when nothing was written");

  // Probation is the awkward one: a text agreement cannot carry an "if" the way code can, so an
  // unset probation has to remove its whole sentence rather than fill in a word. "The first none
  // are a trial period" is worse than saying nothing.
  const clause = "9. Ending it\nThere is a trial period of [Probation] from the start. Either of us may end it at any time.";
  const withP = fillPlaceholders(clause, d({ probation: "2 weeks" }));
  ok(withP.includes("trial period of 2 weeks"), "a probation that is set reads as written");
  const noP = fillPlaceholders(clause, d());
  ok(!noP.includes("trial period") && !noP.includes("[Probation]") && !noP.includes("none"),
     "an unset probation takes its sentence with it rather than filling in a word", noP);
  ok(noP.includes("9. Ending it"), "…and the clause heading survives — the removal must not cross a line", noP.split("\n")[0]);
  ok(noP.includes("Either of us may end it at any time."), "…and the rest of the clause is untouched");

  // A span of one. The editor builds these from a number and a unit, so a one-month probation
  // reached a signed partnership agreement as "a trial period of 1 months".
  ok(tidySpan("1 months") === "1 month", "a one-month span reads as one month");
  ok(tidySpan("1 weeks") === "1 week", "…and one week");
  ok(tidySpan("11 months") === "11 months", "…without mangling eleven");
  ok(tidySpan("2 months") === "2 months", "…and leaving the plural alone where it belongs");
  ok(fillPlaceholders(clause, d({ probation: "1 months" })).includes("trial period of 1 month from"),
     "the fix reaches the agreement itself, not just the helper");
}

console.log("\n── when a 401 means 'sign in again' ──");
{
  // A session lasts seven days and nothing stops a page being open when it runs out. From then on
  // every call 401s while the page still looks signed in — buttons silently refuse and it reads as
  // a broken feature. That is exactly how "Add day off" presented itself.
  ok(shouldSignOut(401, "/api/meet/admin/blackouts") === true, "a 401 on a scheduling call means the session ended");
  ok(shouldSignOut(401, "/api/portal/tasks") === true, "…and on a portal call");
  ok(shouldSignOut(403, "/api/portal/monitor") === false,
     "a 403 must NOT sign anyone out — 'not yours' is not 'not signed in'");
  ok(shouldSignOut(200, "/api/portal/tasks") === false, "a good response is left alone");
  ok(shouldSignOut(401, "/api/portal/login") === false,
     "a failed sign-in is an answer, not a reason to bounce off the login page");
  ok(shouldSignOut(401, "https://api.stripe.com/v1/x") === false,
     "someone else's 401 says nothing about this session");
  ok(shouldSignOut(401, "not a url at all") === false, "an unparseable url never signs anyone out");
}

console.log("\n── ignoring a finding hides THAT finding, never a new one ──");
{
  // The whole risk of an Ignore button: set aside "Bhavya has no calendar" and quietly never hear
  // "Bhavya AND two others have no calendar".
  const was = "Bhavya Sharma — bookable but nothing lands in their diary";
  const now = "Bhavya Sharma, Tavishi Bansal — bookable but nothing lands in their diary";
  ok(stillIgnored("2026-08-24T00:00:00Z", was, was, true) === true, "the same finding stays ignored");
  ok(stillIgnored("2026-08-24T00:00:00Z", was, now, true) === false,
     "a CHANGED finding comes straight back — a new fault must not hide behind an old decision");
  ok(stillIgnored("2026-08-24T00:00:00Z", was, was, false) === false,
     "once it passes the ignore is spent, so the next break is heard");
  ok(stillIgnored(null, was, was, true) === false, "nothing ignored means nothing hidden");
}

console.log("\n── when a probation ends ──");
{
  const end = probationEnds("2026-08-26", "1 months");
  ok(!!end && end.getFullYear() === 2026 && end.getMonth() === 8 && end.getDate() === 26,
     "a month from 26 Aug is 26 Sep", String(end));
  const wk = probationEnds("2026-08-26", "2 weeks");
  ok(!!wk && wk.getMonth() === 8 && wk.getDate() === 9, "two weeks is fourteen days", String(wk));

  // Both halves are needed. A missing one must produce nothing rather than a date invented from
  // whichever half exists — this is shown against a real person as fact.
  ok(probationEnds(null, "1 months") === null, "no start date, no answer");
  ok(probationEnds("2026-08-26", null) === null, "no probation, no answer");
  ok(probationEnds("2026-08-26", "forever") === null, "an unreadable period is not guessed at");

  // A bare ISO date read as UTC lands on the previous day once rendered in IST — the same bug that
  // walked people's date of birth backwards.
  ok(probationEnds("2026-03-01", "1 months")!.getDate() === 1, "the day does not drift a timezone");

  const before = probationStatus("2026-08-26", "1 months", new Date(2026, 8, 20));
  ok(before !== null && !before.over && /ends/.test(before.label), "still running reads as ends", before?.label);
  const on = probationStatus("2026-08-26", "1 months", new Date(2026, 8, 26));
  ok(on !== null && !on.over, "the last day is not yet over");
  const after = probationStatus("2026-08-26", "1 months", new Date(2026, 8, 27));
  ok(after !== null && after.over && /ended/.test(after.label), "the day after is over", after?.label);
}

console.log("\n── whose birthday is next ──");
{
  const now = new Date(2026, 8, 4);            // 4 Sept 2026
  const team = [
    { name: "Asha", dob: "2003-09-04" },       // today
    { name: "Bilal", dob: "2001-09-05" },      // tomorrow
    { name: "Chetan", dob: "16 Aug 2005" },    // already gone this year → next year
    { name: "Divya", dob: "2000-09-20" },
    { name: "Eshan", dob: "" },                // nothing recorded
    { name: "Farah", dob: "not a date" },      // unreadable
  ];
  const up = upcomingBirthdays(team, now, 10);
  ok(up.length === 4, "people with no readable date of birth are left out, not guessed at", String(up.length));
  ok(up[0].name === "Asha" && up[0].days === 0 && up[0].label === "Today", "today comes first", JSON.stringify(up[0]));
  ok(up[1].name === "Bilal" && up[1].days === 1 && up[1].label === "Tomorrow", "then tomorrow", up[1]?.label);
  ok(up[2].name === "Divya", "then the rest in order");
  const chetan = up.find((x) => x.name === "Chetan")!;
  ok(chetan.days > 300, "a birthday already past this year rolls to next year", String(chetan.days));

  // The whole point of a shared board: names and dates, never ages.
  const shown = up.map((u) => u.label + " " + u.date).join(" ");
  ok(!/\b(19|20)\d{2}\b/.test(shown), "no year of birth reaches the screen", shown);

  // Both date formats live in that column — ISO from the form, display text from early records.
  ok(JSON.stringify(dobMonthDay("2005-08-16")) === JSON.stringify({ y: 2005, m: 8, d: 16 }), "an ISO date reads");
  ok(JSON.stringify(dobMonthDay("16 Aug 2005")) === JSON.stringify({ y: 2005, m: 8, d: 16 }), "…and so does display text");
  ok(dobMonthDay("16/08/2005") === null && dobMonthDay(null) === null, "anything else is refused rather than half-read");

  // Test accounts get a date of birth in the future, and a board announcing one is hard to explain.
  ok(upcomingBirthdays([{ name: "Demo (test login)", dob: "2026-08-19" }], new Date(2026, 8, 4)).length === 0,
     "a date of birth in the future is not one");

  // …and one with a plausible date is still not a person to wish, or to email.
  ok(upcomingBirthdays([{ name: "tester", dob: "2000-01-01" }], new Date(2026, 8, 4)).length === 0,
     "a placeholder account is not on the board");
  ok(isPlaceholderPerson("tester") && isPlaceholderPerson("Demo Partner (test login)"),
     "placeholder accounts are recognised");
  ok(upcomingBirthdays([{ name: "Noor Hassan", dob: "1995-09-04", kind: "partner", source: "portal" }], new Date(2026, 8, 4)).length === 0,
     "somebody added from the portal is not on the board either — one rule, both places");
  ok(upcomingBirthdays([{ name: "Renu Jakhar", dob: "1994-09-04", kind: "partner", source: "onboarding" }], new Date(2026, 8, 4)).length === 1,
     "…and somebody who filled in the form is, whatever their record calls them");
  ok(!isPlaceholderPerson("Testa Rossi") && !isPlaceholderPerson("Prakhar Agarwal") && !isPlaceholderPerson("Demoiselle Roy"),
     "a real name that merely contains the letters is left alone");

  // 29 February. Somebody born on it should still be wished in a common year.
  const leap = nextOccurrence(2, 29, new Date(2027, 0, 5));
  ok(leap.getMonth() === 2 && leap.getDate() === 1, "29 Feb falls on 1 March in a common year", String(leap));
  const realLeap = nextOccurrence(2, 29, new Date(2028, 0, 5));
  ok(realLeap.getMonth() === 1 && realLeap.getDate() === 29, "…and on the 29th when there is one", String(realLeap));

  // The owner sits in their own table as well as, sometimes, the employee list.
  const dupe = upcomingBirthdays([{ name: "Hardev", dob: "2000-09-04" }, { name: "hardev", dob: "2000-09-04" }], now);
  ok(dupe.length === 1, "the same person twice is one line, not two");

  // The server runs in UTC; between midnight and 05:30 IST its own date is still yesterday's.
  const t = istToday(new Date("2026-09-04T20:00:00Z"));   // 05:30 IST on the 5th
  ok(t.getDate() === 5 && t.getMonth() === 8, "today is India's today, not the server's", String(t));
  ok(t.getHours() === 0 && t.getMinutes() === 0, "…and starts at midnight");
}

console.log("\n── who gets the birthday mail ──");
{
  const P = (name: string, email: string, dob: string | null, kind = "intern", source = "onboarding") =>
    ({ name, email, dob, kind, source });
  const team = [
    P("Tavishi Bansal", "tavishi@x.com", "2007-09-04"),          // today
    P("Prakhar Agarwal", "prakhar@x.com", "1999-09-05"),         // tomorrow
    P("Amir Khurram", "amir@x.com", "2005-08-16"),
    // Recorded as a partner, but she filled in the onboarding form — so she is on the team.
    P("Renu Jakhar", "renu@x.com", "1994-09-04", "partner", "onboarding"),
    // Added from the portal: a network partner, and outside all of this.
    P("Noor Hassan", "noor@x.com", "1995-09-04", "partner", "portal"),
    P("Hardev Singh Thakur", "hardev@x.com", "2000-08-09", "owner", "owner"),
    P("tester", "tester@x.com", "2000-09-04"),                   // placeholder, also today
    P("No Email", "", "2001-09-04"),
  ];
  const now = new Date(2026, 8, 4);
  const plan = planFor(team, now)!;
  ok(!!plan, "a plan is made when somebody has a birthday");

  const names = plan.celebrants.map((c) => c.name).sort();
  ok(JSON.stringify(names) === JSON.stringify(["Renu Jakhar", "Tavishi Bansal"]),
     "everyone who came through the onboarding form is wished", names.join(","));
  ok(names.includes("Renu Jakhar"),
     "…including one recorded as a partner: how she was ADDED is what decides it, not what she is called");
  ok(!names.includes("Noor Hassan"),
     "somebody added from the portal is a network partner and is not wished", names.join(","));
  ok(!names.includes("tester"), "a placeholder account is never emailed — that address belongs to somebody real");
  ok(!plan.celebrants.some((c) => !c.email), "nobody without an address is queued for a send");

  const aud = plan.audience.map((a) => a.email).sort();
  ok(!aud.includes("tavishi@x.com") && !aud.includes("renu@x.com"),
     "the people whose birthday it is are not told about their own birthday", aud.join(","));
  ok(!aud.includes("noor@x.com") && !plan.audience.some((a) => a.source === "portal"),
     "network partners are not told about anybody's — their address is held to pay them", aud.join(","));
  ok(aud.includes("hardev@x.com") && aud.includes("prakhar@x.com"), "the rest of the team is told", aud.join(","));
  ok(!aud.includes("tester@x.com"), "…and placeholder accounts are not");

  // What it actually says.
  ok(/Tavishi/.test(plan.team.subject) || /Renu/.test(plan.team.subject), "the announcement names them", plan.team.subject);
  ok(!/\b(19|20)\d{2}\b/.test(plan.team.text + plan.team.subject), "no year of birth in the announcement either");
  ok(!/\b(he|she|his|her)\b/i.test(plan.team.text), "nothing assumes anybody's pronouns", plan.team.text);
  const g = plan.greeting.text(plan.celebrants[0]);
  ok(/Happy birthday/i.test(g) && !/\b(19|20)\d{2}\b/.test(g), "the greeting is a greeting, with no age in it");

  ok(planFor(team, new Date(2026, 8, 6)) === null, "no birthdays, no plan and nothing sent");
  ok(nameList(["A"]) === "A" && nameList(["A", "B"]) === "A and B" && nameList(["A", "B", "C"]) === "A, B and C",
     "names read as a sentence");
}

console.log("\n── the week a task belongs to ──");
{
  const monday = weekStartIST("2026-08-21T10:00:00Z");   // a Friday
  ok(monday === "2026-08-17", "a week starts on Monday, in IST", monday);
  const inWeek = tasksInWeek([
    task({ id: "in", assigned_at: "2026-08-19T05:00:00Z" }),
    task({ id: "out", assigned_at: "2026-08-25T05:00:00Z" }),
  ], monday);
  ok(inWeek.length === 1 && inWeek[0].id === "in", "only that week's tasks count towards its review");
}

console.log("\n── the watchdog reporting on itself ──");
{
  const recent = new Date(Date.now() - 5 * 60_000).toISOString();
  const byId = (cs: ReturnType<typeof beatChecks>) => new Map(cs.map((c) => [c.id, c]));

  // The bug: readBeats returned [] both when the table was empty AND when it could not be read.
  // A failed read then reported every scheduled job as "has never reported in" — two invented
  // CRITICAL alerts about jobs that had run minutes earlier.
  const unreadable = beatChecks(null);
  ok(unreadable.length === 1, "an unreadable heartbeat table produces ONE finding, not one per job");
  ok(unreadable[0].id === "beat.unreadable" && unreadable[0].ok === null,
     "…and it is unknown, not a failure — we have no evidence either way");
  ok(!/never reported in/.test(unreadable[0].detail),
     "…and it never claims a job has never run when we simply could not look");

  // A genuinely empty table still means exactly what it used to.
  const empty = byId(beatChecks([]));
  ok(empty.get("beat.monitor")?.ok === null && /never reported in/.test(empty.get("beat.monitor")!.detail),
     "an empty heartbeat table does still say the job has never reported in");

  // And a job that beat minutes ago is passing, not silent.
  const live = byId(beatChecks([{ name: "monitor", at: recent }, { name: "meet-reminders", at: recent }]));
  ok(live.get("beat.monitor")?.ok === true, "a job that beat five minutes ago is running");
  ok(live.get("beat.meet-reminders")?.ok === true, "…both of them");

  // Silence beyond the grace window is still caught.
  const old = byId(beatChecks([{ name: "monitor", at: new Date(Date.now() - 6 * 3_600_000).toISOString() }]));
  ok(old.get("beat.monitor")?.ok === false, "a job silent for six hours is still reported as stopped");
}

console.log("\n" + "=".repeat(56));
if (fails.length) {
  console.log(`❌ ${fails.length} logic guard(s) FAILED:`);
  for (const f of fails) console.log("   ✗ " + f);
  process.exit(1);
}
console.log(`✅ ALL ${pass} LOGIC GUARDS PASS`);
