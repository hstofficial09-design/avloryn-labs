/**
 * Partner Portal DB layer — talks to the SAME database LivoDraft uses (single source
 * of truth). The employees + employee_commissions tables live in LivoDraft's Postgres;
 * LivoDraft writes commissions at payment, this portal reads them + manages employees +
 * payouts. Set env LIVODRAFT_DATABASE_URL to LivoDraft's DATABASE_URL.
 *
 * Server-only. Never import from a client component.
 */
import { Pool, type PoolClient } from "pg";
import { normaliseFields, defaultFields, type Field } from "@/lib/careers-fields";
import { randomUUID } from "crypto";

let pool: Pool | null = null;
let schemaReady = false;

export function getPool(): Pool | null {
  if (pool) return pool;
  const url = process.env.LIVODRAFT_DATABASE_URL;
  if (!url) return null;
  const local = /localhost|127\.0\.0\.1/.test(url);
  pool = new Pool({
    connectionString: url,
    ssl: local ? false : { rejectUnauthorized: false },
    max: 4,
  });
  return pool;
}

/** Additive + idempotent. The portal owns the login credential + the onboarding
 *  profile + soft-delete + password-reset columns on the shared employees table. */
async function ensureSchema(c: PoolClient) {
  if (schemaReady) return;
  const add = (col: string, type = "TEXT") =>
    c.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS ${col} ${type}`);
  await add("password_hash");
  // onboarding profile (shown when the owner opens an employee)
  await add("dob");
  await add("address");
  await add("id_type");
  await add("id_number");
  await add("is_student");
  await add("college");
  await add("student_id");
  await add("start_date");
  await add("duration");
  // Answers to the owner's custom onboarding questions (JSON array of {q,a}).
  await add("custom_answers");
  // soft-delete: records kept, hard-purged 1 year after deleted_at
  await add("deleted_at");
  // password reset (forgot-password flow)
  await add("reset_token");
  await add("reset_expires");
  // per-role commission model (owner toggles which tracks are commission-based)
  await c.query(`CREATE TABLE IF NOT EXISTS track_settings (
    track TEXT PRIMARY KEY, commission_enabled BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT now())`);
  // role config for the onboarding form + legal docs
  await c.query(`ALTER TABLE track_settings ADD COLUMN IF NOT EXISTS paid BOOLEAN NOT NULL DEFAULT FALSE`);
  await c.query(`ALTER TABLE track_settings ADD COLUMN IF NOT EXISTS salary INT`);
  await c.query(`ALTER TABLE track_settings ADD COLUMN IF NOT EXISTS salary_period TEXT`);          // 'monthly' | 'yearly'
  await c.query(`ALTER TABLE track_settings ADD COLUMN IF NOT EXISTS scope TEXT`);                  // responsibilities clause override
  await c.query(`ALTER TABLE track_settings ADD COLUMN IF NOT EXISTS terms TEXT`);                  // per-role Terms & Conditions (editable)
  await c.query(`ALTER TABLE track_settings ADD COLUMN IF NOT EXISTS sensitive BOOLEAN NOT NULL DEFAULT FALSE`);
  await c.query(`ALTER TABLE track_settings ADD COLUMN IF NOT EXISTS default_emp_type TEXT NOT NULL DEFAULT 'intern'`);
  await c.query(`ALTER TABLE track_settings ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE`);
  // The owner's own baseline for "Reset to default". Without it, Reset restored the built-in
  // template and an accidental click could wipe a role's edited agreement.
  await c.query(`ALTER TABLE track_settings ADD COLUMN IF NOT EXISTS default_terms TEXT`);
  // HR is non-commission + handles sensitive data, by default
  await c.query(`INSERT INTO track_settings (track, commission_enabled, sensitive) VALUES ('Human Resources', FALSE, TRUE) ON CONFLICT (track) DO NOTHING`);
  // onboarding form field config + editable legal text (single JSON rows)
  await c.query(`CREATE TABLE IF NOT EXISTS form_config (id INT PRIMARY KEY DEFAULT 1, config JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ)`);
  await c.query(`CREATE TABLE IF NOT EXISTS legal_config (id INT PRIMARY KEY DEFAULT 1, config JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ)`);
  // Careers: the openings the owner publishes. Applications are NOT stored anywhere — they
  // are emailed straight to the careers inbox with the CV attached (owner's decision).
  await c.query(`CREATE TABLE IF NOT EXISTS job_openings (
    id           TEXT PRIMARY KEY,
    slug         TEXT UNIQUE NOT NULL,
    title        TEXT NOT NULL,
    department   TEXT,
    emp_type     TEXT NOT NULL DEFAULT 'Internship',
    work_mode    TEXT NOT NULL DEFAULT 'Remote',
    location     TEXT,
    experience   TEXT,
    compensation TEXT,
    openings     INT  NOT NULL DEFAULT 1,
    summary      TEXT,
    description  TEXT,
    apply_by     TEXT,
    status       TEXT NOT NULL DEFAULT 'draft',
    form_fields  JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await c.query(`CREATE INDEX IF NOT EXISTS job_openings_status ON job_openings(status)`);
  await c.query(`ALTER TABLE job_openings ADD COLUMN IF NOT EXISTS form_fields JSONB NOT NULL DEFAULT '[]'::jsonb`);

  // owner's own personal profile (single row)
  await c.query(`CREATE TABLE IF NOT EXISTS company_profile (
    id INT PRIMARY KEY DEFAULT 1, full_name TEXT, email TEXT, mobile TEXT, dob TEXT, address TEXT, updated_at TIMESTAMPTZ)`);
  await c.query(`ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS start_date TEXT`);
  // One-time normalisation. Early records stored dates as display text ("16 Aug 2005") while
  // later ones stored ISO, so the same column held two formats and each person's record read
  // differently. Convert the stragglers so every record is the same shape. Done in SQL on
  // purpose — to_date has no timezone to get wrong, unlike new Date().toISOString(), which is
  // what shifted dates a day earlier in the first place. Only touches values that are not
  // already ISO, so every later boot is a no-op. The pattern matches ONLY the
  // 3-letter form the app itself produces ("16 Aug 2005"); to_date rejects a full month
  // name under 'Mon' and would abort the statement.
  for (const col of ["dob", "start_date"]) {
    try {
      await c.query(
        `UPDATE employees SET ${col} = to_char(to_date(${col}, 'DD Mon YYYY'), 'YYYY-MM-DD')
         WHERE ${col} IS NOT NULL AND ${col} <> ''
           AND ${col} !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
           AND ${col} ~ '^[0-9]{1,2} [A-Za-z]{3} [0-9]{4}$'`);
    } catch { /* a stray unparseable value must never stop the app booting */ }
  }
  // ── BD 2-tier partner network (SHARED with LivoDraft; defensive idempotent creates so the
  //    portal never breaks if it queries before LivoDraft has migrated the shared DB) ──
  await add("role");           // partner role label (campus ambassador / influencer / agency …)
  await add("parent_bd_id");   // the BD intern this partner sits under ('' = top-level / a BD itself)
  await c.query(`CREATE TABLE IF NOT EXISTS partner_codes (
    code TEXT PRIMARY KEY, employee_id TEXT NOT NULL,
    discount_pct REAL DEFAULT 25, commission_pct REAL DEFAULT 10, override_pct REAL DEFAULT 2,
    active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  await c.query(`CREATE TABLE IF NOT EXISTS partner_roles (role TEXT PRIMARY KEY, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  for (const rl of ["Campus Ambassador", "Influencer", "Thesis Writing Agency"]) {
    try { await c.query(`INSERT INTO partner_roles (role) VALUES ($1) ON CONFLICT DO NOTHING`, [rl]); } catch { /* */ }
  }
  await c.query(`ALTER TABLE employee_commissions ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'direct'`);
  // Network Partner/CA payout profile (bank + UPI) — so commission can be auto-paid; the partner fills these
  // in their own portal profile, or the owner sets them in the LivoDraft admin.
  await add("payout_account_name"); await add("payout_account_no"); await add("payout_ifsc");
  await add("payout_upi"); await add("payout_pan");
  // Network-partner approval: BD-added partners start pending until the owner approves.
  await add("partner_approved", "INTEGER DEFAULT 1");
  schemaReady = true;
}

async function withClient<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const p = getPool();
  if (!p) throw new Error("LIVODRAFT_DATABASE_URL not configured");
  const c = await p.connect();
  try {
    await ensureSchema(c);
    return await fn(c);
  } finally {
    c.release();
  }
}

export type EmployeeCode = { code: string; commission_pct: number; active: number; uses: number };

export type Employee = {
  id: string; name: string; email: string | null; mobile: string | null;
  emp_type: string; track: string | null; commission_pct: number;
  active: number; source: string; has_password?: boolean;
  // onboarding profile
  dob?: string | null; address?: string | null; id_type?: string | null;
  id_number?: string | null; is_student?: string | null; college?: string | null;
  student_id?: string | null; start_date?: string | null; duration?: string | null;
  /** JSON array of {q,a} — answers to the owner's custom onboarding questions. */
  custom_answers?: string | null;
  deleted_at?: string | null;
  // LivoDraft promo code(s) linked to this employee + the commission % set on them
  codes?: EmployeeCode[];
};

export type CommissionOrder = {
  id: string; employee_id: string; product: string; code: string | null;
  doc_ref: string | null; order_amount_inr: number; commission_pct: number;
  commission_inr: number; status: string; created_at: string;
};

export type EmployeeSummary = Employee & {
  orders: number; sales: number; earned: number; pending: number; paid: number;
};

export async function getEmployeeByEmail(email: string) {
  return withClient(async (c) => {
    const r = await c.query(
      `SELECT id,name,email,mobile,emp_type,track,commission_pct,active,source,
              (password_hash IS NOT NULL AND password_hash<>'') AS has_password, password_hash
       FROM employees WHERE LOWER(email)=LOWER($1) LIMIT 1`, [email]);
    return r.rows[0] || null;
  });
}

/** Every code linked to an employee, grouped by employee_id — BOTH the old promo-style
 *  employee codes AND the new referral-style partner/affiliate codes. Defensive: a missing
 *  table must never break the dashboard. */
async function employeeCodesMap(c: PoolClient): Promise<Record<string, EmployeeCode[]>> {
  const map: Record<string, EmployeeCode[]> = {};
  try {
    const r = await c.query(
      `SELECT employee_id, code, commission_pct, active, uses FROM promo_codes
       WHERE employee_id IS NOT NULL AND employee_id <> ''`);
    for (const row of r.rows) {
      (map[row.employee_id] ||= []).push({
        code: row.code, commission_pct: +row.commission_pct, active: +row.active, uses: +(row.uses || 0),
      });
    }
  } catch { /* promo_codes may not exist in a fresh DB */ }
  try {
    const p = await c.query(
      `SELECT employee_id, code, commission_pct, active FROM partner_codes
       WHERE employee_id IS NOT NULL AND employee_id <> ''`);
    for (const row of p.rows) {
      (map[row.employee_id] ||= []).push({
        code: row.code, commission_pct: +row.commission_pct, active: +row.active, uses: 0,
      });
    }
  } catch { /* partner_codes not migrated yet */ }
  return map;
}

const PROFILE_COLS = "e.dob,e.address,e.id_type,e.id_number,e.is_student,e.college,e.student_id,e.start_date,e.duration,e.custom_answers";

export async function listEmployeesWithSummary(): Promise<EmployeeSummary[]> {
  return withClient(async (c) => {
    const r = await c.query(`
      SELECT e.id,e.name,e.email,e.mobile,e.emp_type,e.track,e.commission_pct,e.active,e.source,
             ${PROFILE_COLS},
             (e.password_hash IS NOT NULL AND e.password_hash<>'') AS has_password,
             COUNT(ec.id)::int AS orders,
             COALESCE(SUM(ec.order_amount_inr),0) AS sales,
             COALESCE(SUM(ec.commission_inr),0) AS earned,
             COALESCE(SUM(CASE WHEN ec.status='pending' THEN ec.commission_inr ELSE 0 END),0) AS pending,
             COALESCE(SUM(CASE WHEN ec.status='paid' THEN ec.commission_inr ELSE 0 END),0) AS paid
      FROM employees e LEFT JOIN employee_commissions ec ON ec.employee_id=e.id
      WHERE e.deleted_at IS NULL
      GROUP BY e.id ORDER BY e.created_at DESC`);
    const rows = r.rows.map(roundSummary);
    const codes = await employeeCodesMap(c);
    for (const row of rows) row.codes = codes[row.id] || [];
    return rows;
  });
}

/** id -> name for EVERY employee (incl. soft-deleted) — resolves names in the orders table. */
export async function allEmployeeNames(): Promise<Record<string, string>> {
  return withClient(async (c) => {
    const r = await c.query(`SELECT id, name FROM employees`);
    const m: Record<string, string> = {};
    for (const row of r.rows) m[row.id] = row.name;
    return m;
  });
}

export type DeletedEmployee = { id: string; name: string; email: string | null; emp_type: string; track: string | null; deleted_at: string };
export async function listDeletedEmployees(): Promise<DeletedEmployee[]> {
  return withClient(async (c) => {
    const r = await c.query(
      `SELECT id,name,email,emp_type,track,deleted_at FROM employees
       WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`);
    return r.rows;
  });
}

export async function listCommissionOrders(employeeId?: string): Promise<CommissionOrder[]> {
  return withClient(async (c) => {
    const r = employeeId
      ? await c.query(`SELECT * FROM employee_commissions WHERE employee_id=$1 ORDER BY created_at DESC`, [employeeId])
      : await c.query(`SELECT * FROM employee_commissions ORDER BY created_at DESC LIMIT 200`);
    return r.rows.map((o) => ({ ...o, order_amount_inr: +o.order_amount_inr, commission_pct: +o.commission_pct, commission_inr: +o.commission_inr }));
  });
}

export async function employeeOwnData(email: string) {
  const emp = await getEmployeeByEmail(email);
  if (!emp) return null;
  // SECURITY: never let the password hash reach the client bundle — strip it here.
  const { password_hash, ...safeEmp } = emp as any;
  const [summary] = (await listEmployeesWithSummary()).filter((s) => s.id === emp.id);
  const orders = await listCommissionOrders(emp.id);
  return { employee: safeEmp as Employee, summary, orders };
}

// ══════════════════════════════════════════════════════════════════════════════
//  BD 2-TIER PARTNER NETWORK  (campus ambassador · influencer · agency …)
//  Codes live in LivoDraft's shared DB. A BD intern recruits partners who each get a
//  referral-style affiliate code; the BD earns an override on their whole network.
// ══════════════════════════════════════════════════════════════════════════════
export type NetworkPartner = {
  id: string; name: string; email: string | null; mobile: string | null;
  role: string | null; parent_bd_id: string | null; active: number;
  code: string; codes: string[];
  orders: number; sales: number; partner_commission: number;
  bd_commission: number; bd_pending: number;
};

const r2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;

/** True company GMV — each sale counted ONCE. A 2-tier sale writes two commission rows (partner
 *  'direct' + BD 'override') with the same order_amount, so we sum only the non-override rows. */
export async function companyGmv(): Promise<number> {
  return withClient(async (c) => {
    try {
      const r = await c.query(
        `SELECT COALESCE(SUM(order_amount_inr),0) g FROM employee_commissions
         WHERE tier IS DISTINCT FROM 'override'`);
      return r2(+r.rows[0].g);
    } catch { return 0; }
  });
}

/** Add a partner type. The seeded three are only a starting point. */
export async function addPartnerRole(role: string) {
  const r = String(role || "").trim().slice(0, 60);
  if (!r) throw new Error("Give the role a name");
  return withClient((c) => c.query(`INSERT INTO partner_roles (role) VALUES ($1) ON CONFLICT DO NOTHING`, [r]));
}

/** Remove a partner type. Refused while anyone is still on it, so nobody is left role-less. */
export async function deletePartnerRole(role: string) {
  const r = String(role || "").trim();
  if (!r) throw new Error("Which role?");
  return withClient(async (c) => {
    const used = await c.query(`SELECT count(*)::int n FROM employees WHERE role=$1 AND deleted_at IS NULL`, [r]);
    if (used.rows[0].n > 0) {
      // Something for the owner to fix, not a server fault — carry the right status with it.
      const e: any = new Error(`${used.rows[0].n} partner(s) are on “${r}” — move them first.`);
      e.status = 409;
      throw e;
    }
    await c.query(`DELETE FROM partner_roles WHERE role=$1`, [r]);
  });
}

export async function listPartnerRolesPortal(): Promise<string[]> {
  return withClient(async (c) => {
    try { return (await c.query(`SELECT role FROM partner_roles ORDER BY role`)).rows.map((x) => x.role); }
    catch { return []; }
  });
}

/** Is this employee a BD intern (i.e. gets the network-builder UI)? True when they already
 *  have downstream partners, or their role reads as a BD role. */
export async function partnerBdMeta(email: string): Promise<{ id: string; isBd: boolean } | null> {
  return withClient(async (c) => {
    const e = await c.query(
      `SELECT id, role, emp_type, parent_bd_id FROM employees WHERE LOWER(email)=LOWER($1) LIMIT 1`, [email]);
    if (!e.rows[0]) return null;
    const row = e.rows[0];
    const id = row.id;
    const topLevelPartner = row.emp_type === "partner" && !String(row.parent_bd_id || "").trim();
    // A BD (network-builder) is: an explicit BD role/type, OR any top-level partner partner (so they
    // can recruit their first partner without a chicken-and-egg), OR anyone who already has partners.
    let isBd = /\bbd\b|business\s*development/i.test(String(row.role || "")) || row.emp_type === "bd" || topLevelPartner;
    if (!isBd) {
      try { isBd = (await c.query(`SELECT 1 FROM employees WHERE parent_bd_id=$1 LIMIT 1`, [id])).rows.length > 0; }
      catch { /* partner cols not migrated yet */ }
    }
    return { id, isBd };
  });
}

/** Unclaimed employees a BD may attach as a partner: active, no referral code yet, and not
 *  already under another BD. (The WRITE still goes through LivoDraft's engine.) */
export async function listAttachableEmployees(bdId: string): Promise<{ id: string; name: string; emp_type: string }[]> {
  return withClient(async (c) => {
    try {
      const r = await c.query(
        `SELECT e.id, e.name, e.emp_type FROM employees e
         WHERE e.active=1 AND COALESCE(e.deleted_at::text,'')=''
           AND e.id <> $1
           AND e.id NOT IN (SELECT employee_id FROM partner_codes)
           AND (COALESCE(e.parent_bd_id,'')='' OR e.parent_bd_id=$1)
         ORDER BY e.created_at DESC`, [bdId]);
      return r.rows;
    } catch { return []; }
  });
}

// ── Network-partner APPROVAL (owner approves a BD-added partner → login + activate code) ──
export type PendingPartner = { id: string; name: string; email: string | null; mobile: string | null; role: string | null; bd_name: string; code: string; created_at: string };

export async function listPendingPartners(): Promise<PendingPartner[]> {
  return withClient(async (c) => {
    try {
      const r = await c.query(
        `SELECT e.id, e.name, e.email, e.mobile, e.role, e.created_at,
                COALESCE(bd.name,'') AS bd_name,
                COALESCE((SELECT code FROM partner_codes WHERE employee_id=e.id ORDER BY created_at LIMIT 1),'') AS code
         FROM employees e LEFT JOIN employees bd ON bd.id = e.parent_bd_id
         WHERE e.emp_type='partner' AND COALESCE(e.partner_approved,1)=0
           AND COALESCE(e.deleted_at::text,'')=''
         ORDER BY e.created_at DESC`);
      return r.rows;
    } catch { return []; }
  });
}

/** Fetch a pending partner's basics (to email them). has_password tells the caller whether they
 *  ALREADY have a portal login (an existing employee) — so approval never resets it. */
export async function getPendingPartner(id: string): Promise<{ id: string; name: string; email: string | null; has_password: boolean } | null> {
  return withClient(async (c) => {
    const r = await c.query(
      `SELECT id, name, email, (password_hash IS NOT NULL AND password_hash<>'') AS has_password
       FROM employees WHERE id=$1 AND emp_type='partner' AND COALESCE(partner_approved,1)=0 LIMIT 1`, [id]);
    return r.rows[0] || null;
  });
}

/** Approve a network partner + ACTIVATE their code(s). passwordHash is set ONLY when provided
 *  (new person); an existing employee keeps their current login. One transaction — never
 *  half-approved. */
export async function approvePartnerWithLogin(id: string, passwordHash?: string | null) {
  return withClient(async (c) => {
    await c.query("BEGIN");
    try {
      if (passwordHash) {
        await c.query(`UPDATE employees SET password_hash=$1, partner_approved=1 WHERE id=$2`, [passwordHash, id]);
      } else {
        await c.query(`UPDATE employees SET partner_approved=1 WHERE id=$1`, [id]);
      }
      await c.query(`UPDATE partner_codes SET active=1 WHERE employee_id=$1`, [id]);
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; }
  });
}

// ── HIERARCHY: the buyers (users) under a network partner — spend + commission + status ──
export type PartnerUser = { name: string; email: string; docs: number; spent: number; commission: number; pending: number; paid: number };

/** Buyers under the given partner employee-ids (a partner passes their own id; a BD passes all
 *  their partners' ids). Emails are MASKED for privacy. */
export async function partnerUsers(empIds: string[]): Promise<PartnerUser[]> {
  if (!empIds || empIds.length === 0) return [];
  return withClient(async (c) => {
    try {
      const r = await c.query(
        `SELECT u.full_name, u.email,
                COUNT(DISTINCT ec.job_id) AS docs,
                COALESCE(SUM(ec.order_amount_inr),0) AS spent,
                COALESCE(SUM(ec.commission_inr),0) AS commission,
                COALESCE(SUM(CASE WHEN ec.status='pending' THEN ec.commission_inr ELSE 0 END),0) AS pending,
                COALESCE(SUM(CASE WHEN ec.status='paid'    THEN ec.commission_inr ELSE 0 END),0) AS paid
         FROM employee_commissions ec
         JOIN generation_jobs gj ON gj.id = ec.job_id
         JOIN users u ON u.id = gj.user_id
         WHERE ec.employee_id = ANY($1) AND ec.tier='direct'
         GROUP BY u.id, u.full_name, u.email
         ORDER BY spent DESC`, [empIds]);
      return r.rows.map((x) => ({
        name: (x.full_name || "").split(" ")[0] || "Student",
        email: maskEmail(x.email || ""),
        docs: +x.docs, spent: r2(+x.spent), commission: r2(+x.commission),
        pending: r2(+x.pending), paid: r2(+x.paid),
      }));
    } catch { return []; }
  });
}

function maskEmail(e: string): string {
  const [u, d] = String(e || "").split("@");
  if (!d) return "—";
  const shown = u.length <= 2 ? u[0] || "" : u.slice(0, 2);
  return `${shown}${"*".repeat(Math.max(1, u.length - shown.length))}@${d}`;
}

/** Is this logged-in employee a network partner, who's their BD, and their active referral code
 *  (for the shareable link + QR). (For their own dashboard.) */
export async function partnerSelf(email: string): Promise<{ id: string; isPartner: boolean; bd_name: string; ref_code: string } | null> {
  return withClient(async (c) => {
    const r = await c.query(
      `SELECT e.id, e.emp_type, COALESCE(bd.name,'') AS bd_name,
              EXISTS(SELECT 1 FROM partner_codes p WHERE p.employee_id=e.id) AS has_code,
              COALESCE((SELECT code FROM partner_codes p WHERE p.employee_id=e.id AND p.active=1 ORDER BY p.created_at LIMIT 1),'') AS ref_code
       FROM employees e LEFT JOIN employees bd ON bd.id=e.parent_bd_id
       WHERE LOWER(e.email)=LOWER($1) LIMIT 1`, [email]);
    if (!r.rows[0]) return null;
    const row = r.rows[0];
    return { id: row.id, isPartner: row.emp_type === "partner" || row.has_code, bd_name: row.bd_name, ref_code: row.ref_code };
  });
}

async function networkOf(c: PoolClient, bdId: string): Promise<NetworkPartner[]> {
  let partners: any[] = [];
  try {
    partners = (await c.query(
      `SELECT id,name,email,mobile,role,parent_bd_id,active FROM employees
       WHERE parent_bd_id=$1 ORDER BY created_at DESC`, [bdId])).rows;
  } catch { return []; }
  const out: NetworkPartner[] = [];
  for (const s of partners) {
    let codes: string[] = [];
    try { codes = (await c.query(`SELECT code FROM partner_codes WHERE employee_id=$1`, [s.id])).rows.map((x) => x.code); } catch { /* */ }
    const d = (await c.query(
      `SELECT COUNT(*)::int n, COALESCE(SUM(order_amount_inr),0) sales, COALESCE(SUM(commission_inr),0) earned
       FROM employee_commissions WHERE employee_id=$1 AND tier='direct'`, [s.id])).rows[0];
    const ov = (await c.query(
      `SELECT COALESCE(SUM(commission_inr),0) bd_earned,
              COALESCE(SUM(CASE WHEN status='pending' THEN commission_inr ELSE 0 END),0) bd_pending
       FROM employee_commissions WHERE employee_id=$1 AND tier='override'
         AND code IN (SELECT code FROM partner_codes WHERE employee_id=$2)`, [bdId, s.id])).rows[0];
    out.push({
      id: s.id, name: s.name, email: s.email, mobile: s.mobile, role: s.role,
      parent_bd_id: s.parent_bd_id, active: +s.active,
      code: codes[0] || "", codes,
      orders: +d.n, sales: r2(d.sales), partner_commission: r2(d.earned),
      bd_commission: r2(ov.bd_earned), bd_pending: r2(ov.bd_pending),
    });
  }
  return out;
}

export async function listPartnerNetwork(bdId: string): Promise<NetworkPartner[]> {
  return withClient((c) => networkOf(c, bdId));
}

/** Owner observer: every BD intern (any employee with ≥1 downstream partner) + their network. */
export async function listPartnerBds(): Promise<
  { id: string; name: string; network: NetworkPartner[]; bd_earned: number; bd_pending: number }[]
> {
  return withClient(async (c) => {
    let ids: any[] = [];
    try {
      ids = (await c.query(
        `SELECT DISTINCT parent_bd_id FROM employees
         WHERE parent_bd_id IS NOT NULL AND parent_bd_id<>''`)).rows;
    } catch { return []; }
    const out = [];
    for (const row of ids) {
      const bd = (await c.query(`SELECT id,name FROM employees WHERE id=$1`, [row.parent_bd_id])).rows[0];
      if (!bd) continue;
      const network = await networkOf(c, bd.id);
      out.push({
        id: bd.id, name: bd.name, network,
        bd_earned: r2(network.reduce((a, s) => a + s.bd_commission, 0)),
        bd_pending: r2(network.reduce((a, s) => a + s.bd_pending, 0)),
      });
    }
    return out;
  });
}

// NOTE: partner CODES are minted by LivoDraft's single engine (Python). The portal never
// generates a code itself — the BD self-serve route forwards to LivoDraft's partner API. This
// keeps one source of truth for code format, uniqueness and the locked rates/scopes.

/** Onboarding form → shared registry. Dedup by email: create if new, else update the
 *  profile fields (never touch password/commission on an existing row). */
export async function upsertEmployeeFromOnboarding(data: {
  name: string; email: string; mobile?: string; emp_type?: string; track?: string;
  dob?: string; address?: string; id_type?: string; id_number?: string;
  is_student?: string; college?: string; student_id?: string; start_date?: string; duration?: string;
  custom_answers?: string;
}): Promise<{ id: string; created: boolean }> {
  return withClient(async (c) => {
    const prof = [
      (data.dob || "").trim(), (data.address || "").trim(), (data.id_type || "").trim(),
      (data.id_number || "").trim(), (data.is_student || "").trim(), (data.college || "").trim(),
      (data.student_id || "").trim(), (data.start_date || "").trim(), (data.duration || "").trim(),
      (data.custom_answers || "").trim() || null,
    ];
    const ex = await c.query(`SELECT id FROM employees WHERE LOWER(email)=LOWER($1) LIMIT 1`, [data.email]);
    if (ex.rows[0]) {
      await c.query(
        `UPDATE employees SET name=$1, mobile=$2, emp_type=$3, track=$4,
           dob=$5,address=$6,id_type=$7,id_number=$8,is_student=$9,college=$10,student_id=$11,start_date=$12,duration=$13,
           custom_answers=COALESCE($14, custom_answers), deleted_at=NULL WHERE id=$15`,
        [data.name.trim(), (data.mobile || "").trim(), data.emp_type || "intern", data.track || "", ...prof, ex.rows[0].id]);
      return { id: ex.rows[0].id, created: false };
    }
    const id = randomUUID();
    await c.query(
      `INSERT INTO employees (id,name,email,mobile,emp_type,track,commission_pct,active,source,
         dob,address,id_type,id_number,is_student,college,student_id,start_date,duration,custom_answers)
       VALUES ($1,$2,$3,$4,$5,$6,10,1,'onboarding',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [id, data.name.trim(), data.email.trim(), (data.mobile || "").trim(), data.emp_type || "intern", data.track || "", ...prof]);
    return { id, created: true };
  });
}

export async function addEmployee(data: {
  name: string; email: string; mobile?: string; emp_type?: string;
  track?: string; commission_pct?: number; password_hash?: string; source?: string;
}): Promise<{ id: string }> {
  return withClient(async (c) => {
    const id = randomUUID();
    await c.query(
      `INSERT INTO employees (id,name,email,mobile,emp_type,track,commission_pct,active,source,password_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8,$9)`,
      [id, data.name.trim(), (data.email || "").trim(), (data.mobile || "").trim(),
       data.emp_type || "intern", data.track || "", Number(data.commission_pct || 10),
       data.source || "manual", data.password_hash || null]);
    return { id };
  });
}

export async function setEmployeePassword(id: string, password_hash: string) {
  return withClient((c) => c.query(`UPDATE employees SET password_hash=$1 WHERE id=$2`, [password_hash, id]));
}

export async function markCommissionsPaid(employeeId: string): Promise<number> {
  return withClient(async (c) => {
    const t = await c.query(
      `SELECT COALESCE(SUM(commission_inr),0) AS t FROM employee_commissions WHERE employee_id=$1 AND status='pending'`, [employeeId]);
    await c.query(
      `UPDATE employee_commissions SET status='paid', paid_at=$1 WHERE employee_id=$2 AND status='pending'`,
      [new Date().toISOString(), employeeId]);
    return Math.round(Number(t.rows[0].t) * 100) / 100;
  });
}

/** Soft delete: hide from the active list but keep the record + its commissions. */
export async function softDeleteEmployee(id: string) {
  return withClient((c) => c.query(
    `UPDATE employees SET deleted_at=$1, active=0 WHERE id=$2`, [new Date().toISOString(), id]));
}

export async function restoreEmployee(id: string) {
  return withClient((c) => c.query(
    `UPDATE employees SET deleted_at=NULL, active=1 WHERE id=$1`, [id]));
}

/** Hard-purge employees soft-deleted more than 1 year ago (+ their commission rows).
 *  Called opportunistically on owner-dashboard load — no cron needed. */
export async function purgeExpiredEmployees(): Promise<number> {
  return withClient(async (c) => {
    const cutoff = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
    const ids = (await c.query(
      `SELECT id FROM employees WHERE deleted_at IS NOT NULL AND deleted_at < $1`, [cutoff])
    ).rows.map((r) => r.id);
    if (ids.length) {
      await c.query(`DELETE FROM employee_commissions WHERE employee_id = ANY($1)`, [ids]);
      await c.query(`DELETE FROM employees WHERE id = ANY($1)`, [ids]);
    }
    return ids.length;
  });
}

/** Forgot-password: store a hashed reset token + expiry on the (non-deleted) employee.
 *  Returns the employee (id/name/email) if the email matched, else null. */
export async function setResetToken(email: string, tokenHash: string, expiresISO: string) {
  return withClient(async (c) => {
    const r = await c.query(
      `UPDATE employees SET reset_token=$1, reset_expires=$2
       WHERE LOWER(email)=LOWER($3) AND deleted_at IS NULL AND active=1
       RETURNING id,name,email`, [tokenHash, expiresISO, email]);
    return r.rows[0] || null;
  });
}

export async function getEmployeeByResetToken(tokenHash: string) {
  return withClient(async (c) => {
    const r = await c.query(
      `SELECT id,email,reset_expires FROM employees WHERE reset_token=$1 AND reset_token<>'' LIMIT 1`, [tokenHash]);
    return r.rows[0] || null;
  });
}

/** Complete a reset: set the new password and clear the token. */
export async function completePasswordReset(id: string, passwordHash: string) {
  return withClient((c) => c.query(
    `UPDATE employees SET password_hash=$1, reset_token=NULL, reset_expires=NULL WHERE id=$2`,
    [passwordHash, id]));
}

function roundSummary(r: any): EmployeeSummary {
  return {
    ...r,
    commission_pct: +r.commission_pct,
    orders: +r.orders,
    sales: Math.round(+r.sales * 100) / 100,
    earned: Math.round(+r.earned * 100) / 100,
    pending: Math.round(+r.pending * 100) / 100,
    paid: Math.round(+r.paid * 100) / 100,
  };
}

// ── Role / track commission settings ─────────────────────────────────────────
export async function listTrackSettings(): Promise<{ track: string; commission_enabled: boolean }[]> {
  return withClient(async (c) => {
    const r = await c.query(`
      SELECT t.track, COALESCE(ts.commission_enabled, TRUE) AS commission_enabled
      FROM (SELECT DISTINCT track FROM employees WHERE track IS NOT NULL AND track<>'' AND deleted_at IS NULL
            UNION SELECT track FROM track_settings WHERE COALESCE(archived,FALSE)=FALSE) t
      LEFT JOIN track_settings ts ON ts.track = t.track
      WHERE COALESCE(ts.archived, FALSE) = FALSE
      ORDER BY t.track`);
    return r.rows.map((x: any) => ({ track: x.track, commission_enabled: x.commission_enabled !== false }));
  });
}

// ── Full role config (onboarding form + legal) ───────────────────────────────
export type RoleConfig = {
  track: string; commission_enabled: boolean; paid: boolean; salary: number | null;
  salary_period: string | null; scope: string | null; terms: string | null; sensitive: boolean; default_emp_type: string;
  /** Owner-saved baseline restored by "Reset to default"; null = use the built-in template. */
  default_terms?: string | null;
};
export async function listRoles(): Promise<RoleConfig[]> {
  return withClient(async (c) => {
    const r = await c.query(`
      SELECT t.track, COALESCE(ts.commission_enabled,TRUE) commission_enabled, COALESCE(ts.paid,FALSE) paid,
             ts.salary, ts.salary_period, ts.scope, ts.terms, ts.default_terms, COALESCE(ts.sensitive,FALSE) sensitive,
             COALESCE(ts.default_emp_type,'intern') default_emp_type
      FROM (SELECT DISTINCT track FROM employees WHERE track IS NOT NULL AND track<>'' AND deleted_at IS NULL
            UNION SELECT track FROM track_settings WHERE COALESCE(archived,FALSE)=FALSE) t
      LEFT JOIN track_settings ts ON ts.track=t.track
      WHERE COALESCE(ts.archived,FALSE)=FALSE
      ORDER BY t.track`);
    return r.rows.map((x: any) => ({
      track: x.track, commission_enabled: x.commission_enabled !== false, paid: x.paid === true,
      salary: x.salary != null ? +x.salary : null, salary_period: x.salary_period || null,
      scope: x.scope || null, terms: x.terms || null, default_terms: x.default_terms || null,
      sensitive: x.sensitive === true, default_emp_type: x.default_emp_type || "intern",
    }));
  });
}
export async function upsertRole(f: RoleConfig) {
  return withClient((c) => c.query(
    `INSERT INTO track_settings (track, commission_enabled, paid, salary, salary_period, scope, terms, sensitive, default_emp_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (track) DO UPDATE SET commission_enabled=$2, paid=$3, salary=$4, salary_period=$5, scope=$6, terms=$7, sensitive=$8, default_emp_type=$9, archived=FALSE`,
    [f.track.trim(), f.commission_enabled, f.paid, f.salary, f.salary_period, f.scope, f.terms, f.sensitive, f.default_emp_type]));
}
/** Make the role's current terms its "default": Reset-to-default then restores THIS text,
 *  so a stray click can never fall back to the built-in template and lose the owner's version. */
export async function setRoleDefaultTerms(track: string, terms: string | null) {
  return withClient((c) => c.query(
    `INSERT INTO track_settings (track, terms, default_terms) VALUES ($1,$2,$2)
     ON CONFLICT (track) DO UPDATE SET terms=$2, default_terms=$2, archived=FALSE`,
    [track.trim(), terms]));
}
export async function archiveRole(track: string) {
  return withClient((c) => c.query(
    `INSERT INTO track_settings (track, archived) VALUES ($1, TRUE) ON CONFLICT (track) DO UPDATE SET archived=TRUE`, [track.trim()]));
}
// Rename a role everywhere (its settings + every employee on it), atomically.
export async function renameRole(oldTrack: string, newTrack: string) {
  const o = String(oldTrack || "").trim(), n = String(newTrack || "").trim();
  if (!o || !n || o === n) return;
  return withClient(async (c) => {
    const ex = await c.query(`SELECT 1 FROM track_settings WHERE track=$1 AND COALESCE(archived,FALSE)=FALSE`, [n]);
    if (ex.rows.length) throw new Error("A role with that name already exists");
    await c.query("BEGIN");
    try {
      await c.query(`UPDATE track_settings SET track=$1 WHERE track=$2`, [n, o]);
      await c.query(`UPDATE employees SET track=$1 WHERE track=$2`, [n, o]);
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; }
  });
}

// ── Onboarding form fields + legal text config (JSON) ────────────────────────
export async function getFormConfig(): Promise<any> {
  return withClient(async (c) => { const r = await c.query(`SELECT config FROM form_config WHERE id=1`); return r.rows[0]?.config || {}; });
}
export async function saveFormConfig(config: any) {
  return withClient((c) => c.query(`INSERT INTO form_config (id, config, updated_at) VALUES (1,$1,now()) ON CONFLICT (id) DO UPDATE SET config=$1, updated_at=now()`, [config]));
}
export async function getLegalConfig(): Promise<any> {
  return withClient(async (c) => { const r = await c.query(`SELECT config FROM legal_config WHERE id=1`); return r.rows[0]?.config || {}; });
}
export async function saveLegalConfig(config: any) {
  return withClient((c) => c.query(`INSERT INTO legal_config (id, config, updated_at) VALUES (1,$1,now()) ON CONFLICT (id) DO UPDATE SET config=$1, updated_at=now()`, [config]));
}
export async function setTrackCommission(track: string, enabled: boolean) {
  return withClient((c) => c.query(
    `INSERT INTO track_settings (track, commission_enabled) VALUES ($1,$2)
     ON CONFLICT (track) DO UPDATE SET commission_enabled=$2`, [track.trim(), enabled]));
}
export async function commissionTracksMap(): Promise<Record<string, boolean>> {
  const rows = await listTrackSettings();
  const m: Record<string, boolean> = {};
  for (const r of rows) m[r.track] = r.commission_enabled;
  return m;
}
/** Is this employee on the commission model? Based on their track (default yes). */
export function trackHasCommission(track: string | null | undefined, map: Record<string, boolean>): boolean {
  if (!track) return true;
  return map[track] !== false;
}

// ── Personal profile (employee + owner) ──────────────────────────────────────
export async function getEmployeeProfile(email: string) {
  return withClient(async (c) => {
    const r = await c.query(
      `SELECT id,name,email,mobile,dob,address,start_date,duration,emp_type,track,
              id_type,id_number,is_student,college,student_id,custom_answers,
              COALESCE(payout_account_name,'') payout_account_name,
              COALESCE(payout_account_no,'')   payout_account_no,
              COALESCE(payout_ifsc,'')         payout_ifsc,
              COALESCE(payout_upi,'')          payout_upi,
              COALESCE(payout_pan,'')          payout_pan
       FROM employees WHERE LOWER(email)=LOWER($1) LIMIT 1`, [email]);
    return r.rows[0] || null;
  });
}
export async function updateEmployeeProfile(email: string, f: {
  name?: string; mobile?: string; dob?: string; address?: string; start_date?: string;
  id_type?: string; id_number?: string; is_student?: string; college?: string; student_id?: string;
  payout_account_name?: string; payout_account_no?: string; payout_ifsc?: string; payout_upi?: string; payout_pan?: string;
}) {
  const v = (x?: string) => (x && x.trim() ? x.trim() : null);
  // COALESCE everywhere: a field the caller omits keeps whatever onboarding stored.
  // Student details are cleared deliberately when the person answers "No", so those pass
  // through an empty string rather than being skipped.
  const clr = (x?: string) => (x === undefined ? null : x.trim() || "");
  return withClient((c) => c.query(
    `UPDATE employees SET name=COALESCE($2,name), mobile=COALESCE($3,mobile), dob=COALESCE($4,dob),
       address=COALESCE($5,address), start_date=COALESCE($6,start_date),
       id_type=COALESCE($7,id_type), id_number=COALESCE($8,id_number),
       is_student=COALESCE($9,is_student), college=COALESCE($10,college), student_id=COALESCE($11,student_id),
       payout_account_name=COALESCE($12,payout_account_name), payout_account_no=COALESCE($13,payout_account_no),
       payout_ifsc=COALESCE($14,payout_ifsc), payout_upi=COALESCE($15,payout_upi), payout_pan=COALESCE($16,payout_pan)
     WHERE LOWER(email)=LOWER($1)`,
    [email, v(f.name), v(f.mobile), v(f.dob), v(f.address), v(f.start_date),
     v(f.id_type), v(f.id_number), v(f.is_student), clr(f.college), clr(f.student_id),
     v(f.payout_account_name), v(f.payout_account_no), v(f.payout_ifsc), v(f.payout_upi), v(f.payout_pan)]));
}
export async function getCompanyProfile() {
  return withClient(async (c) => {
    const r = await c.query(`SELECT full_name,email,mobile,dob,address,start_date FROM company_profile WHERE id=1 LIMIT 1`);
    return r.rows[0] || null;
  });
}
export async function saveCompanyProfile(f: { full_name?: string; email?: string; mobile?: string; dob?: string; address?: string; start_date?: string }) {
  const v = (x?: string) => (x && x.trim() ? x.trim() : null);
  return withClient((c) => c.query(
    `INSERT INTO company_profile (id, full_name, email, mobile, dob, address, start_date, updated_at)
     VALUES (1,$1,$2,$3,$4,$5,$6,now())
     ON CONFLICT (id) DO UPDATE SET full_name=$1,email=$2,mobile=$3,dob=$4,address=$5,start_date=COALESCE($6, company_profile.start_date),updated_at=now()`,
    [v(f.full_name), v(f.email), v(f.mobile), v(f.dob), v(f.address), v(f.start_date)]));
}

// ── Careers / job openings ───────────────────────────────────────────────────
export type Opening = {
  id: string; slug: string; title: string; department: string | null;
  emp_type: string; work_mode: string; location: string | null;
  experience: string | null; compensation: string | null; openings: number;
  summary: string | null; description: string | null; apply_by: string | null;
  status: "draft" | "open" | "closed"; created_at?: string; updated_at?: string;
  /** The application form the owner designed for THIS role (see lib/careers-fields). */
  form_fields: Field[];
};

/** URL-safe slug; callers must still handle the unique-key clash. */
export function slugifyTitle(s: string): string {
  return String(s).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "role";
}

/** pg returns timestamptz as a Date, not a string — hand callers ISO text so a page that
 *  does created_at.slice(0,10) (for JobPosting's datePosted) can't blow up with a 500. */
function asOpening(row: any): Opening {
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : undefined);
  return {
    ...row, openings: Number(row.openings) || 1,
    // Anything on the row could predate a field type or have been edited by hand.
    form_fields: normaliseFields(row.form_fields),
    created_at: iso(row.created_at), updated_at: iso(row.updated_at),
  };
}

/** Today in IST — the closing date the owner typed is an Indian calendar date. */
function todayIST(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** A role whose closing date has passed closes itself, so the owner never has to remember.
 *  Runs opportunistically on read (same approach as the employee purge) — no cron needed. */
async function autoCloseExpired(c: PoolClient) {
  try {
    await c.query(
      `UPDATE job_openings SET status='closed', updated_at=now()
       WHERE status='open' AND apply_by IS NOT NULL AND apply_by <> '' AND apply_by < $1`,
      [todayIST()]);
  } catch { /* never block reading the careers page */ }
}

export async function listOpenings(opts: { publicOnly?: boolean } = {}): Promise<Opening[]> {
  return withClient(async (c) => {
    await autoCloseExpired(c);
    const r = await c.query(
      `SELECT * FROM job_openings ${opts.publicOnly ? "WHERE status='open'" : ""}
       ORDER BY (status='open') DESC, created_at DESC`);
    return r.rows.map(asOpening);
  });
}

export async function getOpeningBySlug(slug: string, publicOnly = false): Promise<Opening | null> {
  return withClient(async (c) => {
    await autoCloseExpired(c);
    const r = await c.query(
      `SELECT * FROM job_openings WHERE slug=$1 ${publicOnly ? "AND status='open'" : ""} LIMIT 1`, [slug]);
    return r.rows[0] ? asOpening(r.rows[0]) : null;
  });
}

/** Copy a role — JD, settings and its application form — as a fresh draft. */
export async function duplicateOpening(id: string): Promise<{ id: string; slug: string }> {
  const src = await withClient(async (c) => {
    const r = await c.query(`SELECT * FROM job_openings WHERE id=$1 LIMIT 1`, [id]);
    return r.rows[0] ? asOpening(r.rows[0]) : null;
  });
  if (!src) throw new Error("That opening no longer exists");
  const { id: _id, slug: _slug, created_at, updated_at, ...rest } = src;
  return upsertOpening({ ...rest, title: `${src.title} (copy)`, status: "draft" });
}

export async function upsertOpening(f: Partial<Opening> & { title: string }): Promise<{ id: string; slug: string }> {
  return withClient(async (c) => {
    const num = (n: unknown, d = 1) => { const v = Math.round(Number(n)); return Number.isFinite(v) && v > 0 ? v : d; };
    const t = (x: unknown) => { const v = String(x ?? "").trim(); return v || null; };
    if (f.id) {
      const r = await c.query(
        `UPDATE job_openings SET title=$2, department=$3, emp_type=$4, work_mode=$5, location=$6,
           experience=$7, compensation=$8, openings=$9, summary=$10, description=$11, apply_by=$12,
           status=$13, form_fields=$14, updated_at=now()
         WHERE id=$1 RETURNING slug`,
        [f.id, f.title.trim(), t(f.department), t(f.emp_type) || "Internship", t(f.work_mode) || "Remote",
         t(f.location), t(f.experience), t(f.compensation), num(f.openings), t(f.summary), t(f.description),
         t(f.apply_by), f.status || "draft", JSON.stringify(normaliseFields(f.form_fields))]);
      if (!r.rows[0]) throw new Error("That opening no longer exists");
      return { id: f.id, slug: r.rows[0].slug };
    }
    // New: keep trying suffixes so two roles with the same name can both exist.
    const base = slugifyTitle(f.title);
    for (let i = 0; i < 25; i++) {
      const slug = i ? `${base}-${i + 1}` : base;
      const id = randomUUID();
      try {
        await c.query(
          `INSERT INTO job_openings (id,slug,title,department,emp_type,work_mode,location,experience,
             compensation,openings,summary,description,apply_by,status,form_fields)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [id, slug, f.title.trim(), t(f.department), t(f.emp_type) || "Internship", t(f.work_mode) || "Remote",
           t(f.location), t(f.experience), t(f.compensation), num(f.openings), t(f.summary), t(f.description),
           t(f.apply_by), f.status || "draft",
           JSON.stringify(f.form_fields ? normaliseFields(f.form_fields) : defaultFields())]);
        return { id, slug };
      } catch (e: any) {
        if (!/duplicate key|unique/i.test(String(e?.message))) throw e;
      }
    }
    throw new Error("Could not create a unique link for that title");
  });
}

export async function setOpeningStatus(id: string, status: "draft" | "open" | "closed") {
  return withClient((c) => c.query(`UPDATE job_openings SET status=$2, updated_at=now() WHERE id=$1`, [id, status]));
}
export async function deleteOpening(id: string) {
  return withClient((c) => c.query(`DELETE FROM job_openings WHERE id=$1`, [id]));
}
