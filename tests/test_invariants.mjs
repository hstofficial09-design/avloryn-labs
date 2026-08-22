/**
 * CLASS GUARD (static) — reads the source and FAILS if a whole class of bug reappears.
 *
 * A test proves one case works. This proves a RULE holds everywhere, so a NEW endpoint that
 * forgets a gate is caught automatically instead of shipping quietly. Every rule below exists
 * because the thing it checks was actually broken at some point.
 *
 * Run:  node tests/test_invariants.mjs
 */
import fs from "fs";
import path from "path";

const ROOT = path.dirname(new URL(import.meta.url).pathname).replace(/\/tests$/, "");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const fails = [];
const fail = (rule, what) => fails.push(`${rule}  ${what}`);

/** Every route.ts under a directory, as { route, file, src }. */
function routes(under) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (e.name === "route.ts") {
        out.push({ route: dir.replace(/^app/, "").replace(/\/\[([^\]]+)\]/g, "/:$1"), file: rel, src: read(rel) });
      }
    }
  };
  walk(under);
  return out;
}

/**
 * Source with comments and imports removed.
 *
 * Needed because a rule that greps raw source is satisfied by the WORD appearing anywhere — in a
 * comment explaining the rule, or in the import line for a function nobody calls any more. Two
 * rules below silently passed against deliberately broken code for exactly that reason.
 */
const code = (p) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")     // block comments
    .replace(/(^|[^:])\/\/.*$/gm, "$1")   // line comments, leaving http:// alone
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];?$/gm, "");

/** The body of one HTTP handler, so a rule can look at POST without seeing GET. */
function handler(src, method) {
  const m = new RegExp(`export async function ${method}\\s*\\(`).exec(src);
  if (!m) return null;
  const from = m.index;
  const next = /\nexport async function [A-Z]+\s*\(/.exec(src.slice(from + 10));
  return src.slice(from, next ? from + 10 + next.index : src.length);
}

const API = routes("app/api");
const WRITES = ["POST", "PATCH", "PUT", "DELETE"];

// ── R1 · every portal endpoint must establish who is calling ────────────────────────────────
// Anything under /api/portal reads or writes company data. An endpoint that never looks at the
// session is open to the internet.
// Signing in, out, and password recovery are how a session begins and ends — they cannot be
// asked to already have one.
const NO_SESSION_YET = ["/api/portal/login", "/api/portal/logout", "/api/portal/forgot-password", "/api/portal/reset-password"];
for (const r of API.filter((r) => r.route.startsWith("/api/portal"))) {
  if (NO_SESSION_YET.includes(r.route)) continue;
  if (!/getSession\s*\(/.test(r.src)) fail("R1 session check MISSING:", `${r.route} (${r.file})`);
}

// ── R2 · scheduling SETUP is the owner's and HR's, not everyone's ───────────────────────────
// Every one of these once asked only "are you signed in?", so any intern could remove a colleague
// from the team, delete a booking link, or rewrite someone else's working hours.
const SETUP = ["members", "types", "availability", "blackouts", "coupons"];
// Using scheduling is not configuring it: creating a meeting stays open to the team, and acting on
// a booking is scoped to its attendees.
const SCHEDULING_WRITE_ALLOW = {
  "/api/meet/admin/create-meeting": "canSchedule",
  "/api/meet/admin/bookings": "schedulingScope",
};
for (const r of API.filter((r) => r.route.startsWith("/api/meet/admin"))) {
  const isSetup = SETUP.some((s) => r.route.endsWith(`/${s}`));
  for (const m of WRITES) {
    const body = handler(r.src, m);
    if (!body) continue;
    if (isSetup) {
      if (!/canManageTeam\s*\(/.test(body)) fail("R2 setup not owner/HR-only:", `${m} ${r.route}`);
    } else {
      const allow = SCHEDULING_WRITE_ALLOW[r.route];
      if (!allow) fail("R2 unclassified scheduling write:", `${m} ${r.route} — add it to the allow-list or gate it with canManageTeam`);
      else if (!new RegExp(allow).test(body)) fail("R2 wrong gate:", `${m} ${r.route} should use ${allow}`);
    }
  }
}

// ── R3 · decisions that belong to the owner must check for the owner ────────────────────────
// Removing a person, restoring them, scoring someone's week, approving a partner: an employee
// session must not be able to do any of it just because they are signed in.
const OWNER_ONLY = [
  "app/api/portal/delete-employee/route.ts",
  "app/api/portal/restore-employee/route.ts",
  "app/api/portal/reviews/route.ts",
  "app/api/portal/partner/approve/route.ts",
];
for (const f of OWNER_ONLY) {
  const r = API.find((x) => x.file === f);
  if (!r) { fail("R3 endpoint vanished:", f); continue; }
  if (!/role\s*[!=]==?\s*"owner"|s\.role === "owner"/.test(r.src)) fail("R3 owner check MISSING:", r.route);
}
// Reassigning someone's task is an assignment decision, not a self-service one.
{
  const t = API.find((x) => x.file === "app/api/portal/tasks/route.ts");
  if (t && !/case "give"[\s\S]{0,220}w\.owner/.test(t.src)) fail("R3 owner check MISSING:", "tasks → give (reassign)");
}

// ── R4 · nothing books over a time that is already taken ────────────────────────────────────
// The public booking route always re-read the calendars; creating by hand and rescheduling did
// not, so either could drop a meeting on top of one already in the diary.
for (const f of ["app/api/meet/reschedule/route.ts", "app/api/meet/admin/create-meeting/route.ts"]) {
  const r = API.find((x) => x.file === f);
  if (!r) { fail("R4 endpoint vanished:", f); continue; }
  if (!/findClashes\s*\(/.test(r.src)) fail("R4 clash check MISSING:", `${r.route} can double-book`);
}

// ── R5 · the sync decides by WHEN a copy changed, never by disagreement alone ────────────────
// Treating any disagreeing copy as "somebody moved it" made the cron undo a reschedule: a copy our
// own write hadn't reached yet looked like a deliberate change.
{
  const sync = read("lib/booking/sync.ts");
  if (!/updatedAt/.test(sync)) fail("R5 sync no longer compares modification times:", "a stale copy can overrule a reschedule again");
  if (!/sort\([\s\S]{0,120}updatedAt/.test(sync)) fail("R5 sync must pick the most recently modified copy:", "lib/booking/sync.ts");
}

// ── R6 · people who were deleted stay deleted, in every listing ──────────────────────────────
// Both apps share the employees table; a listing that forgets the filter shows leavers as staff.
{
  const db = read("lib/portal-db.ts");
  const listings = [...db.matchAll(/FROM employees\s+([\s\S]{0,220}?)(?:`|\)\s*;)/g)];
  let guarded = 0;
  for (const m of listings) if (/deleted_at/.test(m[1])) guarded++;
  if (guarded < 3) fail("R6 employee listings lost their deleted_at filter:", `only ${guarded} of ${listings.length} mention it`);
  if (!/DELETE FROM \$\{t\} WHERE employee_id|portal_tasks", "portal_reviews"/.test(db))
    fail("R6 purge no longer clears a person's work log:", "orphan rows will be left behind");
}

// ── R7 · a document must never die on a character ────────────────────────────────────────────
// pdf-lib's standard fonts are WinAnsi: one rupee sign threw and took the whole download with it.
{
  const pdf = read("lib/worklog-pdf.ts");
  if (!/function pdfSafe/.test(pdf)) fail("R7 pdfSafe is gone:", "lib/worklog-pdf.ts");
  const draws = [...pdf.matchAll(/drawText\(([^,]+),/g)].map((m) => m[1].trim());
  for (const arg of draws) {
    if (!/pdfSafe\(/.test(arg)) fail("R7 raw text drawn into a PDF:", `drawText(${arg}) must go through pdfSafe`);
  }
}

// ── R8 · a delete must reach everywhere the person can still act ─────────────────────────────
// Scheduling is a different database and hears about nothing on its own.
{
  const del = read("app/api/portal/delete-employee/route.ts");
  if (!/setMemberActiveByEmail/.test(del)) fail("R8 delete no longer reaches scheduling:", "a leaver stays bookable");
  const soft = read("lib/portal-db.ts");
  if (!/softDeleteEmployee[\s\S]{0,900}partner_codes SET active=0/.test(soft))
    fail("R8 delete no longer disables their code:", "a leaver keeps earning");
}

// ── R9 · the watchdog must stay read-only, gated, and actually wired up ──────────────────────
// A watchdog is the one thing whose own failure nobody notices, so its wiring is guarded rather
// than trusted. And a monitor that can WRITE is a bug factory pointed straight at production.
{
  const checks = code("lib/monitor/checks.ts");
  // Read-only: no writes, no sends, no bookings. It looks at state, it never changes it.
  for (const [pattern, what] of [
    [/\b(insert|update|delete)\s*\(/i, "a write call"],
    [/\.(?:from\([^)]*\)\.(?:insert|update|delete|upsert))/i, "a Supabase write"],
    [/emails\.send|sendMail/i, "sending email"],
    [/INSERT INTO|UPDATE |DELETE FROM/i, "a SQL write"],
  ]) {
    if (pattern.test(checks)) fail("R9 the watchdog must not change anything:", `checks.ts contains ${what}`);
  }
  // Every check has to be individually guarded or one thrown error takes the whole run with it —
  // and the run that throws is precisely the one you needed to hear about.
  const pushes = (checks.match(/out\.push\(/g) || []).length;
  const guarded = (checks.match(/out\.push\(await attempt\(/g) || []).length;
  if (guarded < pushes) fail("R9 an unguarded check:", `${pushes - guarded} check(s) not wrapped in attempt() — one failure would kill the run`);

  // The dead-man's switch only works if the job it watches actually records a beat.
  const rem = read("app/api/meet/cron/reminders/route.ts");
  if (!/beat\(\s*["']meet-reminders["']/.test(rem))
    fail("R9 the reminders job stopped reporting in:", "its silence is what proves it died — without the beat, a dead cron looks healthy");
  const runner = code("lib/monitor/run.ts");
  if (!/beat\(\s*["']monitor["']/.test(runner))
    fail("R9 the watchdog stopped reporting in:", "a dead watchdog would look like 'all clear'");
  // Alerting must be throttled. Emailing every failure on every run trains you to ignore the
  // email, and then the one that matters is ignored too — so the decision must genuinely be made
  // by shouldAlert(), not merely imported from it.
  if (!/shouldAlert\s*\(/.test(runner))
    fail("R9 alerts are no longer throttled:", "every run would email — alert fatigue is how real alerts get missed");

  // Both cron endpoints must be gated, or anyone can trigger runs and send mail from our domain.
  for (const f of ["app/api/cron/monitor/route.ts", "app/api/meet/cron/reminders/route.ts"]) {
    const r = API.find((x) => x.file === f);
    if (!r) { fail("R9 cron endpoint vanished:", f); continue; }
    if (!/process\.env\.CRON_SECRET/.test(code(f))) fail("R9 cron endpoint is open:", r.route);
  }
  // Owner only, on READING as well as acting. The findings name people ("X's calendar is broken",
  // "a leaver is still earning") and nobody else can do anything about them; this was briefly open
  // to everyone signed in and the whole team saw the red panel.
  const portal = API.find((x) => x.file === "app/api/portal/monitor/route.ts");
  if (!portal) fail("R9 endpoint vanished:", "app/api/portal/monitor/route.ts");
  else {
    const src = code("app/api/portal/monitor/route.ts");
    for (const m of ["GET", "POST"]) {
      const body = handler(src, m);
      if (!body) { fail("R9 handler vanished:", `${m} /api/portal/monitor`); continue; }
      if (!/role !== "owner"/.test(body)) fail("R9 owner check MISSING:", `${m} /api/portal/monitor`);
    }
  }

  // The banner is the half people actually see; unmounted, the whole thing is invisible.
  if (!/<SystemWatch\s*\/>/.test(read("app/portal/PortalHub.tsx")))
    fail("R9 the alert banner is no longer shown:", "app/portal/PortalHub.tsx");
}

// ── R10 · the commission ladder is TWO levels, and a partner is not a recruiter ───────────────
// The engine pays the seller 10% and 2% to whoever recruited them. There is no third level. But
// `partnerBdMeta` once answered "yes, you may build a network" to ANY live approved account — so an
// approved network partner could recruit their own sub-partners. It looked like it worked, because
// the two rows still book; what it actually created was an unbounded recruitment chain nobody
// designed or priced. Every network-building route asks this one function, so guarding it here
// guards all of them.
{
  const db = code("lib/portal-db.ts");
  const fn = /export async function partnerBdMeta[\s\S]*?\n}/.exec(db)?.[0] || "";
  // The check has to be on the isBd VALUE itself. An earlier version accepted the mere presence of
  // an isPartner variable anywhere in the function, so removing it from isBd still passed — the
  // guard proved nothing.
  if (!fn) fail("R10 partnerBdMeta is gone:", "every network-building gate reads it");
  else if (!/isBd:[^,\n]*!isPartner/.test(fn))
    fail("R10 a network partner can build their own network again:", "the ladder is 2 levels — this quietly makes it unbounded");

  // The refusal must be honest. A partner is refused permanently; telling them to wait for an
  // approval they already have leaves them waiting for something that is never coming.
  const create = code("app/api/portal/partner/create/route.ts");
  if (!/isPartner/.test(create))
    fail("R10 the refusal no longer tells a partner why:", "they are approved, so 'awaiting approval' is a lie");
}

console.log(`[invariants] scanned ${API.length} API routes`);
if (fails.length) {
  console.log("FAIL — class-guard violations:");
  for (const f of fails) console.log("  ✗ " + f);
  process.exit(1);
}
console.log("ALL INVARIANTS HOLD ✓ (portal sessions · scheduling setup owner/HR-only · owner-only decisions · clash checks · sync by modification time · deleted stay deleted · PDF-safe text · delete cascades · watchdog read-only, gated and wired)");
