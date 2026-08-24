import { NextResponse } from "next/server";
import { getSession } from "@/lib/portal-auth";
import { listRoles, upsertRole, archiveRole, renameRole, setRoleDefaultTerms, getFormConfig, saveFormConfig, getLegalConfig, saveLegalConfig,
  listRegTypes, upsertRegType, archiveRegType, regKeyFrom, RESERVED_REG_KEYS } from "@/lib/portal-db";
import { defaultTermsText, standardNdaText, roleLabel, isHrRole, sensitiveClause } from "@/lib/intern-docs";
import { bustFormConfigCache } from "@/app/api/onboarding-form/config/route";

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
  const [roles, form, legal, regTypes] = await Promise.all([listRoles(), getFormConfig(), getLegalConfig(), listRegTypes(true)]);
  // Attach the CURRENT default terms per role + the standard NDA, so the editor shows what exists.
  // Use the FRIENDLY label ("M&C" → "Marketing & Community"): passing the raw track code made the
  // default text read "joins as a M&C Intern", which then got saved into the role's terms.
  // "Reset to default" restores the owner's OWN saved baseline when they've set one, so a stray
  // click can never drop a role back to the built-in template and lose their agreement.
  const withDefaults = roles.map((r) => ({
    ...r,
    defaultTerms: r.default_terms
      || defaultTermsText(roleLabel(r.track), isHrRole(r.track) || r.sensitive, r.paid, r.salary, r.salary_period),
    defaultIsCustom: !!r.default_terms,
  }));
  // The NDA is one shared document. Owner-edited text wins; "Reset to default" restores their
  // own saved baseline if they set one, else the standard template.
  const ndaText = legal?.nda || standardNdaText();
  return NextResponse.json({
    roles: withDefaults, regTypes, form, legal, ndaText,
    ndaDefault: legal?.ndaDefault || standardNdaText(),
    ndaIsCustom: !!legal?.nda,
    ndaDefaultIsCustom: !!legal?.ndaDefault,
    sensitiveClause: sensitiveClause(),
  });
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "owner") return deny();
  const d = await req.json().catch(() => ({}));
  // Every action here changes what the public form shows, so drop the cached copy immediately —
  // an owner must never save a change and then be shown the old one.
  bustFormConfigCache();

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
        // Whatever kind the owner configured. Forcing it back to intern|employee here is what
        // made the two hard-coded pills the only real options, however many kinds existed.
        default_emp_type: String(r.default_emp_type || "intern").trim().toLowerCase() || "intern",
      });
      return NextResponse.json({ ok: true });
    }
    // ── the kinds of person who can join ────────────────────────────────────────────────
    if (d.action === "reg-type") {
      const t = d.regType || {};
      const label = String(t.label || "").trim();
      if (!label) return NextResponse.json({ error: "Give it a name" }, { status: 400 });
      // The key is fixed at creation and never follows a rename: it is already written into
      // employees.emp_type for everyone who joined, and dashboards and documents read it.
      const key = String(t.key || "").trim().toLowerCase() || regKeyFrom(label);
      if (!key) return NextResponse.json({ error: "That name has no letters or numbers in it" }, { status: 400 });
      if (RESERVED_REG_KEYS.includes(key)) {
        return NextResponse.json(
          { error: "“Partner” is set aside — network partners are added and approved from the network, not this form." },
          { status: 400 });
      }
      await upsertRegType({
        key, label, enabled: t.enabled !== false,
        sort: Number.isFinite(+t.sort) ? +t.sort : 100,
        terms: typeof t.terms === "string" ? t.terms.slice(0, TERMS_MAX) : null,
      });
      return NextResponse.json({ ok: true, key });
    }
    if (d.action === "reg-type-archive") {
      const key = String(d.key || "").trim().toLowerCase();
      if (!key) return NextResponse.json({ error: "Which kind?" }, { status: 400 });
      // Kept, not deleted: people already carry this key, and a record pointing at a kind nothing
      // can name reads as broken data.
      await archiveRegType(key);
      return NextResponse.json({ ok: true });
    }

    if (d.action === "role-default") {
      const track = String(d.track || "").trim();
      const terms = d.terms ? String(d.terms).trim() : null;
      if (!track) return NextResponse.json({ error: "Role name required" }, { status: 400 });
      if (terms && terms.length > TERMS_MAX)
        return NextResponse.json({ error: `Terms are too long (${terms.length.toLocaleString()} characters). The limit is ${TERMS_MAX.toLocaleString()}.` }, { status: 400 });
      await setRoleDefaultTerms(track, terms);
      return NextResponse.json({ ok: true });
    }
    if (d.action === "nda" || d.action === "nda-default") {
      const text = d.text ? String(d.text).trim() : null;
      if (text && text.length > TERMS_MAX)
        return NextResponse.json({ error: `The NDA is too long (${text.length.toLocaleString()} characters). The limit is ${TERMS_MAX.toLocaleString()}.` }, { status: 400 });
      const legal = (await getLegalConfig()) || {};
      // "nda" saves the working text; "nda-default" also makes it the reset baseline.
      const next = d.action === "nda-default"
        ? { ...legal, nda: text, ndaDefault: text }
        : { ...legal, nda: text };
      await saveLegalConfig(next);
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
