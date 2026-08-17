import { NextResponse } from "next/server";
import { getSession } from "@/lib/portal-auth";
import { approvePartnerAndEmail } from "@/lib/partner-approve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** OWNER-ONLY. Approve a BD-added network partner: generate a login password, activate their
 *  referral code, and EMAIL the credentials straight to the partner. The BD never sees the
 *  password (it isn't returned) — only the partner receives it. */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "owner") return NextResponse.json({ error: "Owner only" }, { status: 403 });
  const d = await req.json().catch(() => ({} as any));
  const id = (d?.employee_id || "").trim();
  if (!id) return NextResponse.json({ error: "employee_id required" }, { status: 400 });

  const r = await approvePartnerAndEmail(id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status || 500 });
  return NextResponse.json({ ok: true, emailed: r.emailed });
}
