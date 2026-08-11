import { NextResponse } from "next/server";
import { getSession } from "@/lib/portal-auth";
import { listRoles, upsertRole, archiveRole, renameRole, getFormConfig, saveFormConfig, getLegalConfig, saveLegalConfig } from "@/lib/portal-db";
import { defaultTermsText, standardNdaText } from "@/lib/intern-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const deny = () => NextResponse.json({ error: "Not authorized" }, { status: 401 });

export async function GET() {
  const s = await getSession();
  if (!s || s.role !== "owner") return deny();
  const [roles, form, legal] = await Promise.all([listRoles(), getFormConfig(), getLegalConfig()]);
  // Attach the CURRENT default terms per role + the standard NDA, so the editor shows what exists.
  const withDefaults = roles.map((r) => ({ ...r, defaultTerms: defaultTermsText(r.track, r.track === "Human Resources" || r.sensitive, r.paid, r.salary, r.salary_period) }));
  return NextResponse.json({ roles: withDefaults, form, legal, ndaText: standardNdaText() });
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "owner") return deny();
  const d = await req.json().catch(() => ({}));

  try {
    if (d.action === "role") {
      const r = d.role || {};
      const track = String(r.track || "").trim();
      if (!track) return NextResponse.json({ error: "Role name required" }, { status: 400 });
      await upsertRole({
        track,
        commission_enabled: r.commission_enabled !== false,
        paid: !!r.paid,
        salary: r.paid && r.salary ? Math.max(0, Math.round(Number(r.salary))) : null,
        salary_period: r.paid ? (r.salary_period === "yearly" ? "yearly" : "monthly") : null,
        scope: r.scope ? String(r.scope).trim().slice(0, 2000) : null,
        terms: r.terms ? String(r.terms).trim().slice(0, 8000) : null,
        sensitive: !!r.sensitive,
        default_emp_type: r.default_emp_type === "employee" ? "employee" : "intern",
      });
      return NextResponse.json({ ok: true });
    }
    if (d.action === "role-archive") {
      const track = String(d.track || "").trim();
      if (!track) return NextResponse.json({ error: "track required" }, { status: 400 });
      await archiveRole(track);
      return NextResponse.json({ ok: true });
    }
    if (d.action === "role-rename") {
      const from = String(d.from || "").trim(), to = String(d.to || "").trim();
      if (!from || !to) return NextResponse.json({ error: "from/to required" }, { status: 400 });
      await renameRole(from, to);
      return NextResponse.json({ ok: true });
    }
    if (d.action === "form") {
      await saveFormConfig(d.config && typeof d.config === "object" ? d.config : {});
      return NextResponse.json({ ok: true });
    }
    if (d.action === "legal") {
      await saveLegalConfig(d.config && typeof d.config === "object" ? d.config : {});
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not save" }, { status: 500 });
  }
}
