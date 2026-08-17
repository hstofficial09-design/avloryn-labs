import { NextResponse } from "next/server";
import { getSession } from "@/lib/portal-auth";
import { partnerBdMeta } from "@/lib/portal-db";
import { approvePartnerAndEmail } from "@/lib/partner-approve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Add a network partner — either to my own network, or (owner) under any employee, or under
 *  nobody at all. The affiliate CODE is minted by LivoDraft's ONE engine (single source of
 *  truth); this route only authorises the caller and forwards the request. Rates/scopes are
 *  locked server-side there (nobody can dial their own rate).
 *  Needs env LIVODRAFT_API_URL (e.g. https://livodraft.com) + PARTNER_API_KEY. */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const d = await req.json().catch(() => ({} as any));
  const name = (d?.name || "").trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const base = (process.env.LIVODRAFT_API_URL || "").replace(/\/+$/, "");
  const key = process.env.PARTNER_API_KEY || "";
  if (!base || !key) {
    return NextResponse.json({ error: "Code service not configured — set LIVODRAFT_API_URL and PARTNER_API_KEY." }, { status: 503 });
  }

  try {
    // Authorise. The owner may either put the partner under any employee (bdId — that person then
    // earns the override on them) or keep them direct (no bdId → nobody above, no override paid).
    // Everyone else builds only their OWN network.
    let bdId = "", bdEmail = "", direct = false;
    if (s.role === "owner") {
      bdId = (d?.bdId || "").trim();
      direct = !bdId;
    } else {
      const meta = await partnerBdMeta(s.email);
      if (!meta) return NextResponse.json({ error: "Your account was not found" }, { status: 404 });
      if (!meta.isBd) {
        return NextResponse.json(
          { error: "Your account can't add partners right now — it's inactive or still awaiting approval." },
          { status: 403 });
      }
      bdEmail = s.email;
    }

    const r = await fetch(`${base}/api/partner/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Partner-Key": key },
      body: JSON.stringify({
        bd_id: bdId, bd_email: bdEmail, direct, name,
        role: (d?.role || "").trim(), email: (d?.email || "").trim(), mobile: (d?.mobile || "").trim(),
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) {
      return NextResponse.json({ error: j.error || "Could not create the partner" }, { status: r.status || 500 });
    }

    // A partner the OWNER added is already vetted — there is nobody left to approve them, so go
    // live straight away and email them their login. A BD-added one stays pending as before.
    if (s.role === "owner" && j.employee_id) {
      const a = await approvePartnerAndEmail(j.employee_id);
      return NextResponse.json({
        ok: true, id: j.employee_id, code: j.code, approved: a.ok, emailed: a.emailed,
        warning: a.ok ? "" : `Partner created, but going live failed: ${a.error}`,
      });
    }
    return NextResponse.json({ ok: true, id: j.employee_id, code: j.code, approved: false });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Code service unreachable" }, { status: 502 });
  }
}
