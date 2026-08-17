import { NextResponse } from "next/server";
import { getSession } from "@/lib/portal-auth";
import { listPartnerRolesPortal, addPartnerRole, deletePartnerRole, partnerBdMeta } from "@/lib/portal-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Partner types (campus ambassador, influencer, agency, …).
 *
 * Network partners are added from BOTH sides — the owner from the admin view and a BD from
 * their own network — so both can add a type too. Otherwise a BD signing up a kind of partner
 * nobody listed yet has to stop and ask.
 */
async function who() {
  const s = await getSession();
  if (!s) return null;
  if (s.role === "owner") return { owner: true };
  try {
    const meta = await partnerBdMeta(s.email);
    return meta?.isBd ? { owner: false } : null;
  } catch {
    return null;
  }
}

export async function GET() {
  if (!(await who())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  try {
    return NextResponse.json({ roles: await listPartnerRolesPortal() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not load roles" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const w = await who();
  if (!w) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const d = await req.json().catch(() => ({}));

  try {
    if (d.action === "add") {
      // Roles are managed only from the owner portal now (not by BDs).
      if (!w.owner) return NextResponse.json({ error: "Only the owner can add a role" }, { status: 403 });
      await addPartnerRole(String(d.role || ""));
      return NextResponse.json({ ok: true, roles: await listPartnerRolesPortal() });
    }
    if (d.action === "delete") {
      // Removing a type is the owner's call — a BD shouldn't delete one another BD is using.
      if (!w.owner) return NextResponse.json({ error: "Only the owner can remove a role" }, { status: 403 });
      await deletePartnerRole(String(d.role || ""));
      return NextResponse.json({ ok: true, roles: await listPartnerRolesPortal() });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not save" }, { status: e?.status || 500 });
  }
}
