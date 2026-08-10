import { NextResponse } from "next/server";
import { listRoles, getFormConfig } from "@/lib/portal-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public (no auth) — drives the onboarding form: which roles, which fields, custom questions.
// Returns only safe display info (no terms/legal/commission internals).
export async function GET() {
  try {
    const [roles, form] = await Promise.all([listRoles(), getFormConfig()]);
    return NextResponse.json({
      roles: roles.map((r) => ({ value: r.track, label: r.track, emp_type: r.default_emp_type })),
      fields: form?.fields || {},
      custom: Array.isArray(form?.custom) ? form.custom : [],
    });
  } catch {
    return NextResponse.json({ roles: [], fields: {}, custom: [] });
  }
}
