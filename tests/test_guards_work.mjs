/**
 * Do the guards actually catch anything?
 *
 * Every rule in test_invariants.mjs exists to fail when a particular thing breaks. Whether it
 * really does is a separate question, and one I have got wrong repeatedly: several rules here
 * passed against code I had deliberately broken, because they asked whether a NAME appeared in a
 * file rather than whether the behaviour was still wired. A rule like that is decoration — it goes
 * green forever and reports nothing.
 *
 * Worse than writing one is trusting one. I have run this check by hand, read past a silent
 * result, and reported the rule as proven in the same commit that shipped it unproven.
 *
 * So it is automatic now. Each entry below breaks one real thing and asserts the guard notices.
 * If a mutation stops applying — because the code moved — that is a failure too: a rule aimed at
 * code that no longer exists is guarding nothing.
 *
 * Run:  node tests/test_guards_work.mjs   (or via npm run guard)
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const ROOT = path.dirname(new URL(import.meta.url).pathname).replace(/\/tests$/, "");
const abs = (p) => path.join(ROOT, p);

/** rule · what breaking it would mean · the file · the exact edit that breaks it */
const MUTATIONS = [
  { rule: "R2", why: "any intern could remove a colleague from the scheduling team",
    // The POST gate specifically — the first occurrence in this file is a display flag in GET,
    // and mutating that proves nothing about who may write.
    file: "app/api/meet/admin/members/route.ts",
    from: "export async function POST(req: Request) {\n  if (!(await canManageTeam())) return deny();",
    to: "export async function POST(req: Request) {\n  if (!(await canSchedule())) return deny();" },
  { rule: "R4", why: "a meeting could be booked on top of one already in the diary",
    file: "app/api/meet/reschedule/route.ts", from: "findClashes(", to: "noClashes(" },
  { rule: "R5", why: "a stale calendar copy could undo somebody's reschedule",
    // The SORT is the rule — "most recently modified wins". The first mention of updatedAt is the
    // type signature, and changing that leaves the decision intact.
    file: "lib/booking/sync.ts",
    from: ".sort((a, b) => Date.parse(b.updatedAt!) - Date.parse(a.updatedAt!));",
    to: ";" },
  { rule: "R9", why: "the watchdog panel would be readable by the whole team",
    file: "app/api/portal/monitor/route.ts", from: 'if (s.role !== "owner") return NextResponse.json({ error: "Not authorized" }, { status: 403 });',
    to: "" },
  { rule: "R10", why: "a network partner could build a network of their own — a third commission level",
    file: "lib/portal-db.ts", from: "isBd: live && !awaitingApproval && !isPartner", to: "isBd: live && !awaitingApproval" },
  { rule: "R11", why: "a partner would be labelled 'Employee' again",
    file: "app/portal/profile/ProfileForm.tsx", from: "roleLabel(profile, { isOwner })",
    to: 'profile.emp_type === "intern" ? "Intern" : isOwner ? "Owner" : "Employee"' },
  { rule: "R12", why: "an expired session would answer 'Not authorized' forever instead of saying so",
    file: "components/portal/session-guard.tsx", from: "if (shouldSignOut(res.status, url)) sessionEnded();", to: "" },
  { rule: "R13", why: "ignoring one finding would hide a different, newer one",
    file: "lib/monitor/state.ts", from: "const stillSame = stillIgnored(p?.muted_at, (p as any)?.muted_detail, detail, failing);",
    to: "const stillSame = !!p?.muted_at;" },
  { rule: "R14", why: "an emp_type never offered on the form could be posted straight in",
    file: "app/api/onboarding-form/route.ts",
    from: "const offered = (await listRegTypes()).filter((t) => t.enabled);",
    to: "const offered = [] as any[];" },
  { rule: "R15", why: "the pool would exhaust a budget shared with LivoDraft and hang the site",
    file: "lib/portal-db.ts", from: "max: 6,", to: "max: 12," },
  { rule: "R16", why: "a member would get the meeting twice",
    file: "lib/booking/google.ts", from: "if (mEmail && attending.has(mEmail)) continue;", to: "" },
  { rule: "R16", why: "a Zoho user would lose their own copy of the meeting",
    file: "app/api/meet/admin/create-meeting/route.ts",
    from: "onGoogle = events.map((e) => e.memberId).filter((id) => !zohoIds.has(id));",
    to: "onGoogle = events.map((e) => e.memberId);" },
  { rule: "R17", why: "the form would ask everyone the same thing regardless of kind",
    file: "app/onboarding-form/intern-form.tsx",
    from: "const effFields = kind?.fields && Object.keys(kind.fields).length ? kind.fields : fieldsCfg;",
    to: "const effFields = fieldsCfg;" },
  { rule: "R18", why: "every role would be titled 'Intern', partners included",
    file: "lib/intern-docs.ts", from: "const isIntern = noun == null ? true : /intern/i.test(noun);", to: "const isIntern = true;" },
  { rule: "R19", why: "the watchdog would go back to depending on GitHub's schedule",
    file: "instrumentation.ts", from: '"/api/cron/monitor"', to: '"/nope"' },
  { rule: "R20", why: "every task brief would print in full again",
    file: "app/portal/WorkLog.tsx", from: "{t.detail && openDetail.has(t.id) && (", to: "{t.detail && (" },
  { rule: "R21", why: "a probation period would be set and appear in no agreement",
    file: "app/api/onboarding-form/route.ts", from: "withProbationClause(", to: "keepAsIs(" },
  { rule: "R21", why: "the preview and the signed PDF would show different agreements",
    file: "app/onboarding-form/intern-form.tsx", from: "withOnCameraClause(", to: "keepAsIs(" },
  { rule: "R21", why: "the likeness clause would skip itself on exactly the camera roles it is for",
    file: "lib/intern-docs.ts",
    from: 'const mentions = (t: string) => /likeness|publicity|image, voice/i.test(t);',
    to: 'const mentions = (t: string) => /likeness|publicity|on camera/i.test(t);' },
  { rule: "R22", why: "partner types would be a separate list again, invisible to the editor",
    file: "lib/portal-db.ts",
    from: `SELECT track FROM track_settings
          WHERE COALESCE(archived,FALSE)=FALSE AND COALESCE(default_emp_type,'intern')='partner'`,
    to: `SELECT role AS track FROM partner_roles WHERE TRUE` },
  { rule: "R22", why: "renaming a role would leave every partner pointing at a name that is gone",
    file: "lib/portal-db.ts",
    from: "await c.query(`UPDATE employees SET role=$1 WHERE role=$2`, [n, o]);", to: "" },
  { rule: "R22", why: "nothing would say when a partner's starter rate should end",
    file: "app/portal/OwnerDashboard.tsx",
    from: "const p = probationStatus(e.start_date, e.probation);", to: "const p = null as any;" },
  { rule: "R22", why: "a partner type could take over a role belonging to an internship",
    file: "lib/portal-db.ts",
    from: `      const e: any = new Error(\`“\${r}” is already a \${clash.rows[0].k} role — give the partner type its own name.\`);
      e.status = 409;
      throw e;`,
    to: "      /* converted anyway */" },
  { rule: "R23", why: "every colleague's age would be printed on every dashboard",
    file: "lib/birthdays.ts",
    from: `weekday: "short", day: "numeric", month: "short"`,
    to: `weekday: "short", day: "numeric", month: "short", year: "numeric"` },
  { rule: "R23", why: "birthdays would land a day out between midnight and 05:30 IST",
    file: "lib/birthdays.ts",
    from: "export function upcomingBirthdays(people: BirthdayPerson[], now = istToday(), limit = 6)",
    to: "export function upcomingBirthdays(people: BirthdayPerson[], now = new Date(), limit = 6)" },
  { rule: "R23", why: "one failed lookup would take everybody's dashboard down with it",
    file: "app/portal/page.tsx",
    from: "  } catch { return { rows: [], missing: 0 }; }", to: "  } finally { /* nothing */ }" },
  { rule: "R23", why: "the board would be shown to the owner alone",
    file: "app/portal/PortalHub.tsx",
    from: "<Birthdays rows={birthdays || []} missing={birthdaysMissing} />",
    to: "{isOwner && <Birthdays rows={birthdays || []} missing={birthdaysMissing} />}" },
  { rule: "R24", why: "a crash between sending and recording would wish somebody twice",
    file: "lib/birthday-mail.ts",
    from: "    if (!(await claimBirthdaySend(plan.date, to, kind))) { skipped++; return; }",
    to: "    // claim moved below" },
  { rule: "R24", why: "birthday mail would go out in the middle of the night",
    file: "lib/birthday-mail.ts",
    from: "if (!opts.preview && !opts.force && istHour(now) < SEND_HOUR)",
    to: "if (!opts.preview && !opts.force && false)" },
  { rule: "R24", why: "network partners would be emailed about an intern's birthday",
    file: "lib/birthday-mail.ts",
    from: `const audience = real.filter((p) => isTeamMember(p.source) && !celebrantEmails.has(p.email.toLowerCase()));`,
    to: `const audience = real.filter((p) => !celebrantEmails.has(p.email.toLowerCase()));` },
  { rule: "R24", why: "an owner session could mail the entire team by adding a parameter",
    file: "app/api/cron/birthdays/route.ts",
    from: `  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await runBirthdayMail({ force: url.searchParams.get("force") === "1" }));`,
    to: `  return NextResponse.json(await runBirthdayMail({ force: url.searchParams.get("force") === "1" }));` },
  { rule: "R23", why: "network partners would be back on the birthday board",
    file: "lib/birthdays.ts",
    from: "if (!name || !md || isPlaceholderPerson(name) || !isTeamMember(p.source)) continue;",
    to: "if (!name || !md || isPlaceholderPerson(name)) continue;" },
  { rule: "R23", why: "the dashboard would greet people with yesterday's date every night",
    file: "app/portal/PortalHub.tsx",
    from: "  const pwInput = \"w-full text-[13px] neu-inset",
    to: "  const today = new Date().toLocaleDateString();\n  const pwInput = \"w-full text-[13px] neu-inset" },
  { rule: "R25", why: "a reminder would arrive as its own conversation instead of joining the thread",
    file: "app/api/meet/cron/reminders/route.ts",
    from: "from, to: b.client_email, subject: guestSubject(mTitle), headers: threadHeaders(b.id),",
    to: "from, to: b.client_email, subject: guestSubject(mTitle)," },
  { rule: "R25", why: "a changing subject would split the thread in Zoho however good the headers are",
    file: "app/api/meet/cancel/route.ts",
    from: "from, to: b.client_email, subject: guestSubject(title), headers: threadHeaders(b.id),",
    to: "from, to: b.client_email, subject: `Cancelled: ${title} with Avloryn Labs`, headers: threadHeaders(b.id)," },
];

const runGuard = () => {
  const r = spawnSync("node", [path.join(ROOT, "tests/test_invariants.mjs")], { encoding: "utf8" });
  return (r.stdout || "") + (r.stderr || "");
};

// A clean start, or nothing below means anything.
const baseline = runGuard();
if (!/ALL INVARIANTS HOLD/.test(baseline)) {
  console.log("✗ the invariants do not pass before any mutation — fix that first\n" + baseline);
  process.exit(1);
}

let pass = 0;
const fails = [];
for (const m of MUTATIONS) {
  const file = abs(m.file);
  const original = fs.readFileSync(file, "utf8");
  if (!original.includes(m.from)) {
    fails.push(`${m.rule}: the code it guards has moved — "${m.from.slice(0, 46)}…" is no longer in ${m.file}`);
    console.log(`  ✗ ${m.rule} — mutation no longer applies (${m.file})`);
    continue;
  }
  fs.writeFileSync(file, original.replace(m.from, m.to));
  let out;
  try { out = runGuard(); } finally { fs.writeFileSync(file, original); }   // always put it back
  if (new RegExp(`${m.rule}\\b`).test(out) && /FAIL/.test(out)) {
    pass++; console.log(`  ✓ ${m.rule} catches it — ${m.why}`);
  } else {
    fails.push(`${m.rule} stayed silent while ${m.why}`);
    console.log(`  ✗ ${m.rule} SILENT — ${m.why}`);
  }
}

// And the file is exactly as it was.
const after = runGuard();
if (!/ALL INVARIANTS HOLD/.test(after)) fails.push("a mutation was not restored — the working tree is dirty");

console.log("\n" + "=".repeat(56));
if (fails.length) {
  console.log(`❌ ${fails.length} guard(s) prove nothing:`);
  for (const f of fails) console.log("   ✗ " + f);
  process.exit(1);
}
console.log(`✅ ALL ${pass} GUARDS ACTUALLY CATCH SOMETHING`);
