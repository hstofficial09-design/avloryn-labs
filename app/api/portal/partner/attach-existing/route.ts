import { NextResponse } from "next/server";
import { getSession } from "@/lib/portal-auth";
import { partnerBdMeta } from "@/lib/portal-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** BD self-serve: give an EXISTING (unclaimed) person a referral code, under my network. The
 *  code is minted by LivoDraft's single engine; this route only authorises the BD and forwards.
 *  Safe-scoped server-side (a BD can't hijack another BD's partner). */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const d = await req.json().catch(() => ({} as any));
  const employeeId = (d?.employee_id || "").trim();
  if (!employeeId) return NextResponse.json({ error: "Pick a person" }, { status: 400 });

  const base = (process.env.LIVODRAFT_API_URL || "").replace(/\/+$/, "");
  const key = process.env.PARTNER_API_KEY || "";
  if (!base || !key) {
    return NextResponse.json({ error: "Code service not configured — set LIVODRAFT_API_URL and PARTNER_API_KEY." }, { status: 503 });
  }

  try {
    let bdId = "", bdEmail = "";
    if (s.role === "owner") {
      bdId = (d?.bdId || "").trim();
      if (!bdId) return NextResponse.json({ error: "Pick a BD" }, { status: 400 });
    } else {
      const meta = await partnerBdMeta(s.email);
      if (!meta) return NextResponse.json({ error: "Your account was not found" }, { status: 404 });
      if (!meta.isBd) return NextResponse.json({ error: "Only BD accounts can build a network" }, { status: 403 });
      bdEmail = s.email;
    }

    const r = await fetch(`${base}/api/partner/attach-existing`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Partner-Key": key },
      body: JSON.stringify({ bd_id: bdId, bd_email: bdEmail, employee_id: employeeId }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) {
      return NextResponse.json({ error: j.error || "Could not add the person" }, { status: r.status || 500 });
    }
    return NextResponse.json({ ok: true, code: j.code });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Code service unreachable" }, { status: 502 });
  }
}
