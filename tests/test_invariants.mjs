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

// ── R11 · one place decides what to call somebody ─────────────────────────────────────────────
// This label was hand-written in seven files, each its own chain of ternaries. When network
// partners arrived exactly one of the seven learned about them, so a Campus Ambassador was shown
// as "Employee" on the profile page, the hub and three of the owner's tables. A new kind of person
// must be a change to one function, not a hunt through the app.
{
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (!/node_modules|\.next/.test(e.name)) walk(rel); }
      else if (/\.(tsx?|jsx?)$/.test(e.name) && rel !== "lib/role-label.ts") {
        // The tell is branching on emp_type to produce a NAME — not merely reading the field.
        if (/emp_type\s*===\s*["']intern["']\s*\?/.test(read(rel))) offenders.push(rel);
      }
    }
  };
  walk("app"); walk("lib");
  for (const f of offenders) fail("R11 role label written by hand:", `${f} — use roleLabel() or a partner reads as "Employee"`);
}

// ── R12 · an expired session must say so, not answer "Not authorized" forever ────────────────
// A portal session lasts seven days and nothing stops a page being open when it runs out. From
// then on every call 401s while the page still looks signed in, so buttons silently refuse and it
// reads as a broken feature — which is exactly how "Add day off" presented. One interceptor covers
// every screen; per-call handling would be forgotten by the next thing anyone writes.
// The DECISION is proven behaviourally in test_logic.ts (shouldSignOut); this only checks the
// interceptor is still mounted and still asks it — a grep for "401" would be satisfied by the
// number sitting in a comment.
{
  const g = code("components/portal/session-guard.tsx");
  if (!/shouldSignOut\s*\([^)]*\)/.test(g))
    fail("R12 the 401 interceptor no longer asks whether the session ended:", "components/portal/session-guard.tsx");
  if (!/window\.fetch\s*=/.test(g))
    fail("R12 the fetch interceptor is gone:", "each screen would have to remember 401 on its own");
  if (!/sessionEnded\s*\(/.test(g))
    fail("R12 nothing tells the person to sign in again:", "every button silently refuses");
}

// ── R13 · ignoring a finding hides THAT finding, never a new one ──────────────────────────────
// "Ignore" exists so accepted findings stop taking up attention. The danger is obvious: ignore
// "Bhavya has no calendar" and quietly never hear "Bhavya AND two others have no calendar".
// The rule itself is proven behaviourally in test_logic.ts (stillIgnored); this checks both places
// that decide visibility actually go through it rather than re-implementing the comparison.
{
  const st = code("lib/monitor/state.ts");
  // Both places that decide whether something is still ignored must go through it. Counting uses
  // is not enough: drop one and the total still looks healthy, which is how this rule first passed
  // against code where reconcile had quietly gone back to its own comparison.
  for (const [fn, re] of [["reconcile", /export async function reconcile[\s\S]*?\n}/],
                          ["readState", /export async function readState[\s\S]*?\n}/]]) {
    const body = re.exec(st)?.[0] || "";
    if (!body) { fail("R13 function vanished:", fn); continue; }
    if (!/stillIgnored\s*\(/.test(body))
      fail("R13 ignore visibility decided by hand:", `${fn}() must use stillIgnored — a NEW fault could hide behind an old decision`);
  }
  if (!/if \(t\.muted\) return \{ alert: false/.test(st))
    fail("R13 an ignored finding still emails:", "the button would do nothing anyone can feel");
}

// ── R14 · "who can join" stays configuration, and never hands out partner rules ───────────────
// This list was two radios written into the form with Employee greyed out as "coming soon", which
// is exactly why it stayed that way for months: adding a kind meant editing the form, the submit
// route, the builder and the config API together. It is data now, and must stay data.
//
// The one thing it must never offer is `partner`. That emp_type carries real rules — their own
// dashboard, the 2% override, no network of their own — and the onboarding form is PUBLIC, so a
// self-selectable "Partner" would hand those rules to anyone who found the link.
{
  const form = code("app/onboarding-form/intern-form.tsx");
  if (/name="regType"[\s\S]{0,400}coming soon/.test(form))
    fail("R14 the registration kinds are hard-coded again:", "app/onboarding-form/intern-form.tsx");
  if (!/regTypes\.map/.test(form))
    fail("R14 the form no longer renders the configured kinds:", "adding one would change nothing");

  // The submit route decides what lands in employees.emp_type, so it must check the value against
  // what is actually offered rather than trusting whatever was posted. (Nothing is reserved any
  // more — the owner decides the list — but an arbitrary value posted straight at this public
  // endpoint must still not be able to invent a kind that was never offered.)
  const submit = code("app/api/onboarding-form/route.ts");
  if (!/listRegTypes\s*\(/.test(submit))
    fail("R14 the submitted kind is no longer validated:", "any emp_type could be posted straight in");

  const db = code("lib/portal-db.ts");
  // Remove must mean what the button says. Always archiving made "Remove" behave as "Hide": the
  // row stayed in the list marked Hidden and never went away, which is not what was asked for.
  // Keeping it is only justified when somebody actually holds the key — otherwise their record
  // would point at a kind nothing can name. So: in use → hidden and kept; unused → gone.
  if (!/DELETE FROM reg_types/.test(db))
    fail("R14 a kind nobody holds cannot be deleted:", "'Remove' would quietly only hide it again");
  if (!/emp_type=\$1[\s\S]{0,300}archived=TRUE/.test(db))
    fail("R14 a kind somebody holds is no longer protected:", "deleting it would orphan their record");
}

// ── R15 · the database connection budget is shared, and small ────────────────────────────────
// The pooler runs in session mode with room for 15 clients TOTAL, and LivoDraft's Flask app talks
// to the same database through it. Raising this pool to 12 exhausted the pooler outright —
// "(EMAXCONNSESSION) max clients reached in session mode" — which from the outside does not look
// like a limit, it looks like the site hanging.
{
  const db = code("lib/portal-db.ts");
  const max = /max:\s*(\d+)/.exec(db);
  if (!max) fail("R15 the pool size is no longer set:", "pg defaults to 10, which is over budget here");
  else if (+max[1] > 6) fail("R15 pool max is too large:", `${max[1]} — the pooler allows 15 clients TOTAL and LivoDraft shares them`);
  // Warm connections are what made pages fast; more connections were not.
  if (!/keepAlive:\s*true/.test(db)) fail("R15 connections are no longer kept warm:", "each read pays a >1s handshake again");
  // A pool with no connect timeout waits forever when the pooler is full — the hang, not an error.
  if (!/connectionTimeoutMillis/.test(db)) fail("R15 no connection timeout:", "a full pooler would hang the page instead of failing");
}

// ── R16 · the team are in their own meeting, and the guest is not more welcome than they are ──
// Every member held a COPY of the meeting rather than being on it. Google admits an event's
// attendees into its Meet straight away and makes everyone else knock — so the outside guest, who
// was the only attendee, walked in, while the team stood outside asking to join their own meeting.
{
  const g = code("lib/booking/google.ts");
  if (!/memberEmails/.test(g))
    fail("R16 the team are no longer attendees:", "they will have to ask to be let into their own meeting");
  if (!/responseStatus:\s*["']accepted["']/.test(g))
    fail("R16 the team are invited rather than included:", "they are not being asked, they are attending");
  // Google must email nobody: we send our own invite with an .ics, so anything Google sends is a
  // second message about the same meeting. "externalOnly" was not enough — the team sign in with
  // their own Gmail addresses, which are external to the workspace, so Google mailed each of them
  // an invitation to accept a meeting that was already on their calendar.
  // Scoped to the HOST insert — the one that creates the Meet and carries the attendees. The
  // per-member copies also say sendUpdates "none", so checking the file as a whole was satisfied
  // by those and passed against a host insert that had been changed back.
  {
    // Picked out by what makes it the host insert — it is the one that creates the conference.
    // Anchoring on conferenceDataVersion matched an earlier call in a different function, so the
    // rule was reading a block that never had sendUpdates in it and failing on healthy code.
    const host = g.split("events.insert(").find((chunk) => chunk.includes("conferenceSolutionKey")) || "";
    if (!host) fail("R16 the host insert changed shape:", "lib/booking/google.ts");
    else if (!/sendUpdates:\s*["']none["']/.test(host))
      fail("R16 Google emails the team as well as us:", "an 'accept this invitation' for a meeting they did not need to accept");
  }

  // One person, one event. Being an attendee already puts the meeting on their calendar, so a
  // written copy on top of it is a duplicate — and so is a Zoho mirror of the same booking.
  if (!/attending\.has\(/.test(g))
    fail("R16 a member gets both an invitation and their own copy:", "two events for one meeting");
  for (const f of ["app/api/meet/admin/create-meeting/route.ts", "app/api/meet/book/route.ts"]) {
    const src = code(f);
    if (/onGoogle = events\.map/.test(src))
      fail("R16 Zoho mirrors a meeting the member is already attending:", `${f} — two events for one booking`);
    // An email about a CONFIRMED meeting must carry the invitation. The team's did not, so they
    // got a notice with nothing to accept and nothing that would add itself to their calendar.
    //
    // Only the confirmed ones: "Request received" and "Approval needed" come before anything is
    // settled and would be wrong to attach an invitation to. Matching every send flagged those two
    // and a third whose attachment simply sat further down than the window looked.
    for (const snd of src.split("emails.send(").slice(1)) {
      const subject = /subject:\s*`([^`]*)`/.exec(snd.slice(0, 900))?.[1] || "";
      if (!/Confirmed:|New booking:/.test(subject)) continue;
      const body = snd.slice(0, snd.indexOf("});") + 1 || 2000);
      if (!/attachments/.test(body))
        fail("R16 a confirmed meeting is announced without its invitation:", `${f} — "${subject.slice(0, 40)}" has nothing to accept`);
    }
  }
  // Every path that creates a meeting has to pass them, not just the one that was reported.
  // Checked INSIDE the call, not anywhere in the file: `memberEmails` is a local variable in each
  // of these routes anyway, so a rule that greps the whole file passes even when the argument has
  // been dropped — which is how the first version of this rule missed exactly that.
  for (const f of ["app/api/meet/book/route.ts", "app/api/meet/admin/create-meeting/route.ts",
                   "app/api/meet/admin/bookings/route.ts"]) {
    const src = code(f);
    const call = /createMeetingForMembers\(\{([\s\S]*?)\}\)/.exec(src);
    if (!call) continue;
    if (!/\bmemberEmails\b/.test(call[1]))
      fail("R16 a meeting path leaves the team out:", `${f} — they would have to knock to join`);
  }
}

// ── R17 · the form belongs to the kind, and so does the document ──────────────────────────────
// One shared form asked an employee for their college and how many months they were staying, and
// called everything an internship. Worse, the built-in agreement is an internship agreement in
// SUBSTANCE — "unpaid internship", "no employer-employee relationship is created" — so handing it
// to an employee is not clumsy wording, it is the wrong document saying close to the opposite of
// what was meant, and they sign it.
{
  const form = code("app/onboarding-form/intern-form.tsx");
  // Checked on the ASSIGNMENT, not the name: the first version of this rule accepted `effFields`
  // existing anywhere, so pointing it back at the shared config still passed.
  if (!/effFields\s*=\s*[^;\n]*\bkind\b/.test(form))
    fail("R17 the form no longer follows the chosen kind:", "everyone is asked the same thing again");
  // The questions come from the kind, then narrow to the chosen track. Checked on the source
  // rather than the variable name, which has already changed once under this rule.
  if (!/(allCustom|effCustom)\s*=\s*[^;\n]*\bkind\b/.test(form))
    fail("R17 the questions no longer follow the chosen kind:", "app/onboarding-form/intern-form.tsx");
  if (!/effCustom\s*=[\s\S]{0,200}roles/.test(form))
    fail("R17 a question meant for one track is asked of everyone:", "app/onboarding-form/intern-form.tsx");
  if (/Section title="Internship"/.test(form))
    fail("R17 the form calls every kind an internship:", "an employee reads intern wording throughout");
  if (!/NOUN/.test(form))
    fail("R17 document wording no longer follows the kind:", "app/onboarding-form/intern-form.tsx");

  // The PDF must try the role, then the KIND, before the built-in template.
  const pdf = code("app/api/onboarding-form/route.ts");
  if (!/kindCfg\?\.terms/.test(pdf))
    fail("R17 the kind's own agreement is skipped:", "a non-intern would be given the internship agreement");
  if (!/kindCfg\?\.joining/.test(pdf))
    fail("R17 the kind's own joining letter is skipped:", "app/api/onboarding-form/route.ts");

  // Everywhere a role's documents are resolved — the form, the PDF, and the EDITOR — must use the
  // same order: role, then kind, then template. The editor was the one that did not, so opening a
  // partner role showed an internship agreement in its terms box. The form and the PDF were both
  // right, which made it worse: the only wrong copy was the one you would edit, and saving it
  // would have made it wrong everywhere, because a role's own text overrides its kind's.
  {
    const cfg = code("app/api/portal/onboarding-config/route.ts");
    for (const [what, fn] of [["agreement", "kindTerms"], ["joining letter", "kindJoining"]]) {
      if (!new RegExp(`${fn}\\(`).test(cfg))
        fail("R17 the editor skips the kind's own document:", `${what} — a partner would be shown an intern's`);
    }
  }

  // A role created inside a kind's tab must land in THAT kind, not silently become an intern one.
  const builder = code("app/portal/onboarding/OnboardingBuilder.tsx");
  if (!/default_emp_type:\s*kind\.key/.test(builder))
    fail("R17 a new role does not join the kind it was added under:", "it would default to intern");
  // A role whose kind no longer exists must still be reachable, or it vanishes from every tab.
  if (!/orphanRoles/.test(builder))
    fail("R17 a role with no valid kind would be invisible:", "nothing would list it");

  // How long a role runs belongs to the ROLE. HR's two months was written into the form as a
  // special case — a rule about one role living in the wrong place, where no other role could
  // ever have one and changing it meant changing code.
  if (/isHrRole\([^)]*\)[\s\S]{0,60}up\("duration"/.test(form))
    fail("R17 one role's length is hard-coded in the form again:", "no other role can have one");
  if (!/roleCfg\?\.duration/.test(form))
    fail("R17 the form ignores the role's own length:", "every role would offer the same options");

  // Moving a role between kinds must stay possible — it is the only way to rescue one whose kind
  // has gone, and the Unassigned tab would otherwise be a dead end.
  if (!/default_emp_type[\s\S]{0,200}regTypes\.map/.test(builder))
    fail("R17 a role can no longer be moved between kinds:", "an unassigned role would be stuck");

  // Nothing may be stapled onto the letter after the owner's own text. Those closing lines used to
  // be printed by the PDF, so a carefully written Employment letter still ended with "on
  // completion of your internship…" and no amount of editing could remove it.
  if (/nd\.para\(\s*isHrRole/.test(pdf))
    fail("R17 intern wording is appended to every joining letter again:", "it cannot be edited away");
  if (!/jl\.closing/.test(pdf))
    fail("R17 the letter's own closing lines are not printed:", "the end of every letter would vanish");

  // "Responsibilities" was offered in the editor as "shown in the agreement", saved, length-checked
  // — and read by nothing. Whoever filled it in was writing into a void.
  // A role's own agreement wins over the built-in template, so a setting that only reaches the
  // template silently does nothing for a role that has been customised. That must be said where it
  // can be fixed, not discovered on a signed document.
  if (!/\[Probation\][\s\S]{0,400}r\.terms|r\.terms[\s\S]{0,400}\[Probation\]/.test(builder))
    fail("R17 nothing warns that a probation cannot reach a customised agreement:", "it would silently do nothing");

  // ── R18 · a shared document must not assume everyone is an intern ─────────────────────────
  // The NDA is one document that every kind signs, and it addressed all of them as "the Intern" —
  // a partner signing a confidentiality agreement made out to somebody they are not. The same
  // assumption put "Intern" on the end of every role title, welcoming a partner as a "Business
  // Development Executive Partnership Intern".
  //
  // Checked on the exact strings and on the branch that decides, not on a word appearing
  // somewhere: the first version of this rule was satisfied by "noun" still being in the function
  // signature, and passed against code that had been deliberately broken.
  {
    const dcs = code("lib/intern-docs.ts");
    // Scoped to the NDA. The internship AGREEMENT says "the Intern" quite correctly — it is the
    // intern template, and any other kind has its own. It is the SHARED document that must not.
    const ndaFrom = dcs.indexOf("export function ndaAgreement(");
    const ndaTo = dcs.indexOf("export function", ndaFrom + 10);
    const nda = ndaFrom > -1 ? dcs.slice(ndaFrom, ndaTo > -1 ? ndaTo : undefined) : "";
    if (!nda) fail("R18 the NDA is gone:", "lib/intern-docs.ts");
    else if (/\(the "Intern"\)|\bthe Intern\b|\bThe Intern\b/.test(nda))
      fail("R18 the shared NDA calls everyone an intern:", "a partner would sign a document addressed to somebody else");
    if (!/partyName/.test(dcs))
      fail("R18 documents no longer know what to call the signer:", "the kind's own word is ignored");
    // roleTitle appends "Intern" — that must depend on the kind, not happen to everyone.
    // The record PDF must print only what its kind was actually asked. Every line printed
    // regardless, so a record read "Duration:  months" for someone never asked for one, and
    // asserted "Current student: No" as a fact nobody had supplied.
    const rec = /od\.kv\("Registering as"[\s\S]*?od\.kv\("Submitted"/.exec(pdf)?.[0] || "";
    if (!rec) fail("R18 the record PDF changed shape:", "app/api/onboarding-form/route.ts");
    else {
      for (const k of ["duration", "student", "dob", "address"]) {
        if (!new RegExp(`shown\\("${k}"\\)`).test(rec))
          fail("R18 the record prints a field its kind never asked for:", `"${k}" — an answer nobody gave`);
      }
    }

    const rt = /export const roleTitle[\s\S]*?\n};/.exec(dcs)?.[0] || "";
    if (!rt) fail("R18 roleTitle is gone:", "lib/intern-docs.ts");
    else if (!/isIntern\s*=\s*[^;\n]*\bnoun\b/.test(rt))
      fail("R18 every role is titled 'Intern' again:", "a partner becomes a '…Partnership Intern'");
  }

  const docs = code("lib/intern-docs.ts");
  if (!/d\.scope/.test(docs))
    fail("R17 Responsibilities never reaches the agreement:", "the editor promises it is shown there");

  // The editor's list of switchable fields must match what the form actually gates. Summarising
  // this by hand is how the track and the start date came to appear nowhere at all, while Duration
  // was listed both as always-asked and as optional — the owner cannot configure what they cannot
  // see, and cannot trust a list that disagrees with the form.
  // What is read on the page and what is signed in the PDF must come from the same place, in the
  // same order. The page checked the role then fell back to the built-in template, skipping the
  // KIND — so a partner read the internship agreement, signed it, and received the partnership
  // one. Read one document, sign another.
  if (!/kind\?\.terms/.test(form))
    fail("R17 the form shows a different agreement from the one signed:", "the kind's own text is skipped on screen");
  for (const [what, re] of [["role", /roleCfg\?\.terms/], ["kind", /kind\?\.terms/]]) {
    if (!re.test(pdf.replace(/kindCfg/g, "kind")) && !re.test(form)) {
      fail("R17 preview and PDF disagree:", `the ${what}'s agreement is used by only one of them`);
    }
  }

  const gated = [...form.matchAll(/fVis\(\s*["'](\w+)["']\s*\)/g)].map((m) => m[1]);
  const listed = [...builder.matchAll(/\{\s*key:\s*["'](\w+)["'],\s*label:/g)].map((m) => m[1]);
  for (const k of new Set(gated)) {
    if (!listed.includes(k)) fail("R17 a field the form can hide is not in the editor:", `"${k}" — nobody can switch it`);
  }
  for (const k of listed) {
    if (!gated.includes(k)) fail("R17 the editor offers a switch the form ignores:", `"${k}" — turning it off would do nothing`);
  }
}

// ── R19 · a reminder must not depend on the scheduler being punctual ─────────────────────────
// Reminders went out only if the run landed within 20 minutes of the offset, and otherwise the
// offset was marked handled and silently skipped. Measured over 40 runs, a job asked to run every
// 15 minutes actually ran every 50 on average and once left a five-hour gap — so most reminders
// fell between runs and were never sent, while every run reported success.
{
  const rem = code("app/api/meet/cron/reminders/route.ts");
  if (/CRON_WINDOW/.test(rem))
    fail("R19 reminders are tied to the cron's cadence again:", "most of them will fall between runs");
  if (!/MIN_USEFUL_LEAD/.test(rem))
    fail("R19 nothing decides whether a late reminder is still worth sending:", "either stale ones go out or none do");

  // Grace periods must reflect what the scheduler actually does, or the banner cries wolf — and
  // this is the one warning that has to be believed.
  const st = code("lib/monitor/state.ts");
  const graces = [...st.matchAll(/"(meet-reminders|monitor)":\s*(\d+)/g)].map((m) => [m[1], +m[2]]);
  if (graces.length < 2) fail("R19 the beat grace periods are gone:", "lib/monitor/state.ts");
  for (const [name, min] of graces) {
    if (min < 200) fail("R19 grace is inside the scheduler's ordinary lateness:", `${name} at ${min} min — measured gaps reach 215`);
  }
}

console.log(`[invariants] scanned ${API.length} API routes`);
if (fails.length) {
  console.log("FAIL — class-guard violations:");
  for (const f of fails) console.log("  ✗ " + f);
  process.exit(1);
}
console.log("ALL INVARIANTS HOLD ✓ (portal sessions · scheduling setup owner/HR-only · owner-only decisions · clash checks · sync by modification time · deleted stay deleted · PDF-safe text · delete cascades · watchdog read-only, gated and wired)");
