import { NextResponse } from "next/server";
import { getSession } from "@/lib/portal-auth";
import { getEmployeeProfile, updateEmployeeProfile, getCompanyProfile, saveCompanyProfile } from "@/lib/portal-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  try {
    if (s.role === "owner") {
      const p = (await getCompanyProfile()) || {};
      return NextResponse.json({ owner: true, profile: { full_name: "Hardev Singh Thakur", email: "", mobile: "", dob: "", address: "", ...p } });
    }
    const p = await getEmployeeProfile(s.email);
    return NextResponse.json({ owner: false, profile: p || {} });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not load profile" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const d = await req.json().catch(() => ({}));
  try {
    if (s.role === "owner") {
      await saveCompanyProfile({ full_name: d.name || d.full_name, email: d.email, mobile: d.mobile, dob: d.dob, address: d.address, start_date: d.start_date });
    } else {
      // Employees may only edit their own contact details. Name + start date (joining date)
      // are official records set by the admin via the Team panel — never self-editable
      // (COALESCE keeps the stored values when we omit them here).
      await updateEmployeeProfile(s.email, {
        mobile: d.mobile, dob: d.dob, address: d.address,
        id_type: d.id_type, id_number: d.id_number,
        is_student: d.is_student, college: d.college, student_id: d.student_id,
        // Payout details (for commission auto-payout) — the partner fills their own.
        payout_account_name: d.payout_account_name, payout_account_no: d.payout_account_no,
        payout_ifsc: d.payout_ifsc, payout_upi: d.payout_upi, payout_pan: d.payout_pan,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not save profile" }, { status: 500 });
  }
}
