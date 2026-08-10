import { NextResponse } from "next/server";
import { canSchedule } from "@/lib/booking/admin";
import { listEmployeesWithSummary, getCompanyProfile } from "@/lib/portal-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Company people (portal employees + owner) so Scheduling members can be added
// straight from the employee list — name + email auto-filled.
export async function GET() {
  if (!(await canSchedule())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const people: { name: string; email: string }[] = [];
  try {
    const cp: any = await getCompanyProfile();
    people.push({ name: cp?.full_name || "Hardev Singh Thakur", email: cp?.email || "" });
    for (const e of await listEmployeesWithSummary()) {
      if (e.email) people.push({ name: e.name, email: e.email });
    }
  } catch { /* best-effort — return whatever we have */ }
  return NextResponse.json({ team: people });
}
