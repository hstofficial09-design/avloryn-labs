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
import { taskStatus, workStats, reviewAverage, tenureScore, weekStartIST, tasksInWeek, type Task, type Review } from "../lib/portal-db";

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

console.log("\n" + "=".repeat(56));
if (fails.length) {
  console.log(`❌ ${fails.length} logic guard(s) FAILED:`);
  for (const f of fails) console.log("   ✗ " + f);
  process.exit(1);
}
console.log(`✅ ALL ${pass} LOGIC GUARDS PASS`);
