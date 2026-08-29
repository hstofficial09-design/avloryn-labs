/**
 * Regression guard suite — runs every guard. Non-zero exit if any fails.
 *
 *     npm run guard
 *
 * These lock in behaviour that was broken and fixed, and the invariants that keep whole CLASSES of
 * bug from coming back silently. Run before every push. Nothing here touches a live database, a
 * real calendar, or the network.
 */
import { spawnSync } from "child_process";
import path from "path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const GUARDS = [
  // static class-guard: session, owner-only decisions, scheduling setup, clash checks, sync rule,
  // deleted people, PDF-safe text, delete cascade
  { file: "test_invariants.mjs", run: ["node"] },
  // dead buttons: every endpoint the frontend calls, and every page it links to, exists
  { file: "test_wiring.mjs", run: ["node"] },
  // the decisions that move real things: sync, on-time/late, tenure score
  { file: "test_logic.ts", run: ["npx", "tsx"] },
  // and the one that checks the guards themselves: breaks each rule's subject and insists the
  // rule notices. Several of them did not — they asked whether a NAME appeared in a file, which
  // stays true even when the behaviour has been deleted. Those went green forever and reported
  // nothing, and I shipped at least one of them describing it as proven.
  { file: "test_guards_work.mjs", run: ["node"] },
];

const failed = [];
for (const g of GUARDS) {
  console.log(`\n═══════════ ${g.file} ═══════════`);
  const [cmd, ...pre] = g.run;
  const r = spawnSync(cmd, [...pre, path.join(HERE, g.file)], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  for (const line of out.split("\n")) {
    if (/[✓✗]|FAIL|PASS|HOLD|RESOLVE|Error|scanned|\[wiring\]/.test(line)) console.log("  " + line.trim());
  }
  if (r.status !== 0) { failed.push(g.file); console.log(`  → ${g.file} FAILED (exit ${r.status})`); }
}

console.log("\n" + "=".repeat(56));
if (failed.length) {
  console.log(`❌ ${failed.length} guard(s) FAILED: ${failed.join(", ")}`);
  process.exit(1);
}
console.log(`✅ ALL ${GUARDS.length} GUARDS PASS`);
