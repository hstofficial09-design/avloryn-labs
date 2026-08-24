import { NextResponse } from "next/server";
import { listRoles, getFormConfig, getLegalConfig, listRegTypes } from "@/lib/portal-db";
import { roleLabel } from "@/lib/intern-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cached for a few seconds.
 *
 * This is four database reads, and the database is ~180ms away — so it cost about a second every
 * time. It used to be hit only when somebody opened the public form; it is now read on portal
 * pages too, which made that second land on ordinary navigation. The content changes only when the
 * owner saves in /portal/onboarding, and that clears this immediately (bustFormConfigCache), so
 * the window only ever affects a change made from somewhere else.
 */
let cache: { at: number; body: any } | null = null;
const TTL_MS = 30_000;
export function bustFormConfigCache() { cache = null; }

// Public (no auth) — drives the onboarding form: which roles, which fields, custom questions,
// and each role's AGREEMENT TERMS.
//
// ⚠ `terms` (+ paid/salary, which appear inside those terms) are returned deliberately: the
// hire reads and signs this exact text on the form, and the PDF is built from the SAME source
// (app/api/onboarding-form/route.ts). Without it the form showed the built-in default while the
// emailed PDF carried the owner's edit — two different documents for one signature.
// `sensitive` and the NDA ride along for the same reason — they change the document the hire
// signs. Still withheld: commission_enabled/scope and every other internal setting.
export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) return NextResponse.json(cache.body);
  try {
    const [roles, form, legal, regTypes] = await Promise.all([listRoles(), getFormConfig(), getLegalConfig(), listRegTypes()]);
    const body = {
      // What "I am registering as" offers. Enabled ones only — an archived kind still names the
      // people who joined under it, but nobody new may pick it.
      regTypes: regTypes.filter((t) => t.enabled).map((t) => ({ key: t.key, label: t.label })),
      roles: roles.map((r) => ({
        value: r.track,
        label: roleLabel(r.track), // "M&C" → "Marketing & Community"; full names pass through
        emp_type: r.default_emp_type,
        paid: r.paid,
        salary: r.salary,
        salary_period: r.salary_period,
        terms: r.terms || null,
        sensitive: r.sensitive,
      })),
      // The NDA the hire will actually sign (owner-edited when set), so the form shows it.
      nda: legal?.nda || null,
      fields: form?.fields || {},
      custom: Array.isArray(form?.custom) ? form.custom : [],
    };
    cache = { at: Date.now(), body };
    return NextResponse.json(body);
  } catch {
    return NextResponse.json({ regTypes: [], roles: [], fields: {}, custom: [], nda: null });
  }
}
