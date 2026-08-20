/**
 * BROKEN-WIRING guard — a button that calls an endpoint which doesn't exist is a dead feature that
 * looks alive. Catches a route renamed or removed while a page still points at it, and a page
 * calling something that was never built.
 *
 * Run:  node tests/test_wiring.mjs
 */
import fs from "fs";
import path from "path";

const ROOT = path.dirname(new URL(import.meta.url).pathname).replace(/\/tests$/, "");
const files = (dir, out = []) => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (!/node_modules|\.next/.test(e.name)) files(rel, out); }
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(rel);
  }
  return out;
};

// ── what exists ──
const apiRoutes = new Set();
const pages = new Set();
for (const f of files("app")) {
  const dir = path.dirname(f).replace(/^app/, "") || "/";
  if (/\/route\.ts$/.test(f)) apiRoutes.add(dir);
  if (/\/page\.tsx$/.test(f)) pages.add(dir);
}
/** A dynamic segment matches anything in that position. */
const matches = (want, have) => {
  const w = want.split("/").filter(Boolean), h = have.split("/").filter(Boolean);
  if (w.length !== h.length) return false;
  return h.every((seg, i) => seg.startsWith("[") || seg === w[i]);
};
const apiExists = (u) => [...apiRoutes].some((r) => matches(u, r));
const pageExists = (u) => [...pages].some((r) => matches(u, r));

// ── what the frontend asks for ──
const CALL = /(?:fetch\(|href=|action=|router\.(?:push|replace)\()\s*["'`](\/[^"'`?#\s${]+)/g;
const missingApi = new Map(), missingPage = new Map();
for (const f of files("app").concat(files("components"))) {
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  for (const m of src.matchAll(CALL)) {
    const url = m[1].replace(/\/$/, "") || "/";
    if (url.startsWith("/api/")) {
      if (!apiExists(url)) (missingApi.get(url) || missingApi.set(url, []).get(url)).push(f);
    } else if (!/^\/(static|_next|assets|images|favicon|logo|og-|robots|sitemap)/.test(url) && url !== "/") {
      // Only complain about app pages; anything served as a file or by middleware is out of scope.
      if (!pageExists(url) && !/\.(png|jpe?g|svg|ico|pdf|xml|txt|webp)$/.test(url)) {
        (missingPage.get(url) || missingPage.set(url, []).get(url)).push(f);
      }
    }
  }
}

console.log(`[wiring] ${apiRoutes.size} API routes · ${pages.size} pages`);
let bad = 0;
for (const [u, where] of missingApi) { bad++; console.log(`  ✗ calls a missing endpoint: ${u}  ← ${where[0]}`); }
for (const [u, where] of missingPage) { bad++; console.log(`  ✗ links to a missing page: ${u}  ← ${where[0]}`); }
if (bad) { console.log(`FAIL — ${bad} broken link(s)`); process.exit(1); }
console.log("ALL WIRING RESOLVES ✓ (every endpoint the frontend calls, and every page it links to, exists)");
