import { NextResponse } from "next/server";
import { listRoles, getFormConfig } from "@/lib/portal-db";
import { roleLabel } from "@/lib/intern-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public (no auth) — drives the onboarding form: which roles, which fields, custom questions,
// and each role's AGREEMENT TERMS.
//
// ⚠ `terms` (+ paid/salary, which appear inside those terms) are returned deliberately: the
// hire reads and signs this exact text on the form, and the PDF is built from the SAME source
// (app/api/onboarding-form/route.ts). Without it the form showed the built-in default while the
// emailed PDF carried the owner's edit — two different documents for one signature.
// Still withheld: commission_enabled/scope/sensitive and every other internal setting.
export async function GET() {
  try {
    const [roles, form] = await Promise.all([listRoles(), getFormConfig()]);
    return NextResponse.json({
      roles: roles.map((r) => ({
        value: r.track,
        label: roleLabel(r.track), // "M&C" → "Marketing & Community"; full names pass through
        emp_type: r.default_emp_type,
        paid: r.paid,
        salary: r.salary,
        salary_period: r.salary_period,
        terms: r.terms || null,
      })),
      fields: form?.fields || {},
      custom: Array.isArray(form?.custom) ? form.custom : [],
    });
  } catch {
    return NextResponse.json({ roles: [], fields: {}, custom: [] });
  }
}
