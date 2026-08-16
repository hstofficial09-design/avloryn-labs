import { NextResponse } from "next/server";
import { getSession } from "@/lib/portal-auth";
import { partnerBdMeta } from "@/lib/portal-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** BD self-serve: add a partner to my network. The affiliate CODE is minted by LivoDraft's ONE
 *  engine (single source of truth) — this route only authorises the BD and forwards the request
 *  to LivoDraft's partner API. Rates/scopes are locked server-side there (BD can't change them).
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
    // Authorise: owner may target any BD (bdId); an employee may build only their OWN network,
    // and only if they're actually a BD.
    let bdId = "", bdEmail = "";
    if (s.role === "owner") {
      bdId = (d?.bdId || "").trim();
      if (!bdId) return NextResponse.json({ error: "Pick a BD to add this partner under" }, { status: 400 });
    } else {
      const meta = await partnerBdMeta(s.email);
      if (!meta) return NextResponse.json({ error: "Your account was not found" }, { status: 404 });
      if (!meta.isBd) return NextResponse.json({ error: "Only BD accounts can build a network" }, { status: 403 });
      bdEmail = s.email;
    }

    const r = await fetch(`${base}/api/partner/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Partner-Key": key },
      body: JSON.stringify({
        bd_id: bdId, bd_email: bdEmail, name,
        role: (d?.role || "").trim(), email: (d?.email || "").trim(), mobile: (d?.mobile || "").trim(),
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) {
      return NextResponse.json({ error: j.error || "Could not create the partner" }, { status: r.status || 500 });
    }
    return NextResponse.json({ ok: true, id: j.employee_id, code: j.code });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Code service unreachable" }, { status: 502 });
  }
}
