import { NextResponse } from "next/server";
import { getSession } from "@/lib/portal-auth";
import { listRoles, upsertRole, archiveRole, renameRole, getFormConfig, saveFormConfig, getLegalConfig, saveLegalConfig } from "@/lib/portal-db";
import { defaultTermsText, standardNdaText, roleLabel, isHrRole } from "@/lib/intern-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const deny = () => NextResponse.json({ error: "Not authorized" }, { status: 401 });

// Generous sanity limits — the DB columns are TEXT (no limit of their own). These exist only
// to stop a runaway paste, never to trim a genuine document: a full agreement runs ~3-9k chars.
const TERMS_MAX = 40000;
const SCOPE_MAX = 5000;

export async function GET() {
  const s = await getSession();
  if (!s || s.role !== "owner") return deny();
  const [roles, form, legal] = await Promise.all([listRoles(), getFormConfig(), getLegalConfig()]);
  // Attach the CURRENT default terms per role + the standard NDA, so the editor shows what exists.
  // Use the FRIENDLY label ("M&C" → "Marketing & Community"): passing the raw track code made the
  // default text read "joins as a M&C Intern", which then got saved into the role's terms.
  const withDefaults = roles.map((r) => ({ ...r, defaultTerms: defaultTermsText(roleLabel(r.track), isHrRole(r.track) || r.sensitive, r.paid, r.salary, r.salary_period) }));
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
      // These are legal documents — REFUSE an over-long save rather than silently cutting it.
      // (The old 8000 cap truncated a role's terms mid-word, and the hire then signed that.)
      const scope = r.scope ? String(r.scope).trim() : null;
      const terms = r.terms ? String(r.terms).trim() : null;
      if (terms && terms.length > TERMS_MAX)
        return NextResponse.json({ error: `Terms are too long (${terms.length.toLocaleString()} characters). The limit is ${TERMS_MAX.toLocaleString()} — please shorten them before saving.` }, { status: 400 });
      if (scope && scope.length > SCOPE_MAX)
        return NextResponse.json({ error: `Responsibilities are too long (${scope.length.toLocaleString()} characters). The limit is ${SCOPE_MAX.toLocaleString()}.` }, { status: 400 });
      await upsertRole({
        track,
        commission_enabled: r.commission_enabled !== false,
        paid: !!r.paid,
        salary: r.paid && r.salary ? Math.max(0, Math.round(Number(r.salary))) : null,
        salary_period: r.paid ? (r.salary_period === "yearly" ? "yearly" : "monthly") : null,
        scope,
        terms,
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
