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
import { roleLabel } from "@/lib/role-label";

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
    // The database is ~180ms away and opening a fresh connection to it costs well over a second.
    // With nothing keeping connections warm, a page making several reads at once had to open new
    // ones for them — so asking for four things in parallel took LONGER than asking one at a time
    // (1398ms vs 719ms, measured). Keeping them alive is what fixed that, not having lots of them.
    //
    // ⚠ The ceiling is NOT ours to spend. The pooler runs in session mode with room for 15 clients
    // TOTAL, and LivoDraft's Flask app talks to the same database through it. Asking for 12 here
    // exhausted it outright:
    //     (EMAXCONNSESSION) max clients reached in session mode - max clients are limited to
    //     pool_size: 15
    // — which does not look like a limit from the outside, it looks like the site hanging. Six is
    // enough for the widest page (six reads at once) and leaves the rest for LivoDraft.
    max: 6,
    keepAlive: true,
    idleTimeoutMillis: 300_000,
    // Fail rather than hang if the database is unreachable — a page that eventually errors is far
    // better than one that spins forever.
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", (e) => console.error("[db] idle client error", e.message));
  // Open a few connections in the background straight away, so the cost of the handshake lands on
  // the deploy rather than on whoever happens to load the first page after it.
  for (let i = 0; i < 4; i++) {
    pool.connect().then((c) => c.release()).catch(() => { /* it will be retried on real use */ });
  }
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
  // The joining letter, editable per role like the agreement above it. It was generated from a
  // fixed template that said "Internship Joining Letter" and "Unpaid, deliverable-based" whoever
  // was joining — so an Employee received an intern's letter.
  await c.query(`ALTER TABLE track_settings ADD COLUMN IF NOT EXISTS joining_letter TEXT`);
  await c.query(`ALTER TABLE track_settings ADD COLUMN IF NOT EXISTS joining_letter_default TEXT`);
  // HR is non-commission + handles sensitive data, by default
  await c.query(`INSERT INTO track_settings (track, commission_enabled, sensitive) VALUES ('Human Resources', FALSE, TRUE) ON CONFLICT (track) DO NOTHING`);

  // ── the kinds of person who can join ────────────────────────────────────────────────────
  // "I am registering as" used to be two hard-coded radios on the form, with Employee greyed out
  // as "coming soon". Adding a third kind meant editing the form, the submit route, the builder
  // and the config API together — so in practice it never happened.
  //
  // The KEY is what lands in employees.emp_type and is never renamed after creation: dashboards,
  // documents and the partner rules all read it. The LABEL is what people see and is free to
  // change. Archiving hides a kind from the form without touching anyone who already joined as it.
  await c.query(`CREATE TABLE IF NOT EXISTS reg_types (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort INT NOT NULL DEFAULT 100,
    terms TEXT,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now())`);
  // Seeds match what the form already offered, so nothing shifts on the day this lands. Employee
  // arrives enabled — it was only ever "coming soon" because nothing rendered it.
  for (const [k, l, srt] of [["intern", "Intern", 10], ["employee", "Employee", 20]] as const) {
    await c.query(`INSERT INTO reg_types (key,label,sort) VALUES ($1,$2,$3) ON CONFLICT (key) DO NOTHING`, [k, l, srt]);
  }
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

  // ── Work log: tasks + weekly reviews ────────────────────────────────────────
  // One row per task, numbered per person so everyone's log reads 1, 2, 3…
  // `source` records who wrote it: a task the owner assigned reads differently in a review
  // from one the person set themselves, and after three months nobody remembers which was which.
  // Two separate timestamps on purpose: `done_at` is the person saying they finished, and
  // `delivered_at` is the owner accepting it. Collapsing them into one flag would let a task
  // count as delivered on the strength of the claim alone.
  await c.query(`CREATE TABLE IF NOT EXISTS portal_tasks (
    id           TEXT PRIMARY KEY,
    employee_id  TEXT NOT NULL,
    seq          INT  NOT NULL,
    title        TEXT NOT NULL,
    detail       TEXT,
    source       TEXT NOT NULL DEFAULT 'self',
    assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    due_at       TIMESTAMPTZ,
    done_at      TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await c.query(`CREATE INDEX IF NOT EXISTS portal_tasks_emp ON portal_tasks(employee_id, seq)`);

  // One review per person per week. The week is stored as its Monday so a re-open of the same
  // week updates rather than piles up a second review.
  await c.query(`CREATE TABLE IF NOT EXISTS portal_reviews (
    id          TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    week_start  TEXT NOT NULL,
    scores      JSONB NOT NULL DEFAULT '{}'::jsonb,
    metrics     JSONB NOT NULL DEFAULT '[]'::jsonb,
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS portal_reviews_week ON portal_reviews(employee_id, week_start)`);

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
  /** Network partners: their kind — Campus Ambassador, Influencer, Thesis Writing Agency. */
  role?: string | null;
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
  /** Network partners only: the person whose network they sit in, who earns the 2% override. */
  upline?: string | null;
  /** 0 while a BD-recruited partner is waiting for the owner to approve them. */
  partner_approved?: number | null;
};

export async function getEmployeeByEmail(email: string) {
  return withClient(async (c) => {
    const r = await c.query(
      // `role` is what a network partner actually is — Campus Ambassador, Influencer, agency.
      // Leaving it out is why their own dashboard could only ever call them "Network Partner".
      `SELECT id,name,email,mobile,emp_type,track,role,commission_pct,active,source,
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
      SELECT e.id,e.name,e.email,e.mobile,e.emp_type,e.track,e.role,e.commission_pct,e.active,e.source,
             ${PROFILE_COLS},
             e.partner_approved,
             -- Who recruited this network partner — i.e. who earns the 2% override on their sales.
             -- Without it the owner cannot tell whose network a partner belongs to.
             (SELECT b.name FROM employees b WHERE b.id = e.parent_bd_id) AS upline,
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

/** An employee's PROMO codes (they can own several — for direct sales / campaigns). Separate from
 *  their single referral/affiliate code. Shown on their own dashboard. */
export async function employeePromoCodes(empId: string): Promise<
  { code: string; type: string; value: number; commission_pct: number; active: boolean; uses: number }[]
> {
  if (!empId) return [];
  return withClient(async (c) => {
    try {
      const r = await c.query(
        `SELECT code, type, value, commission_pct, active, uses FROM promo_codes
         WHERE employee_id=$1 ORDER BY code`, [empId]);
      return r.rows.map((x: any) => ({
        code: x.code, type: String(x.type || "percent"), value: +x.value || 0,
        commission_pct: +x.commission_pct || 0,
        active: x.active === 1 || x.active === true, uses: +x.uses || 0,
      }));
    } catch { return []; }
  });
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

/**
 * Can this person build a network (i.e. gets the network-builder UI)?
 *
 * Anyone on the team can. Whoever brings in a network partner earns the override on that
 * partner's sales; anyone who never brings one in simply has an empty network and is no worse
 * off. It used to be BD-only, which meant an intern who found a campus ambassador had to hand
 * them to a BD — and the BD then earned on someone they never signed up.
 *
 * The two people who can't: someone deactivated, and a partner whose own code hasn't been
 * approved yet (they shouldn't be recruiting before they are live themselves).
 */
export async function partnerBdMeta(
  email: string,
): Promise<{ id: string; isBd: boolean; role: string; isPartner: boolean } | null> {
  return withClient(async (c) => {
    const e = await c.query(
      `SELECT id, role, emp_type, active, partner_approved FROM employees WHERE LOWER(email)=LOWER($1) LIMIT 1`,
      [email]);
    if (!e.rows[0]) return null;
    const row = e.rows[0];
    const live = row.active === 1 || row.active === true || row.active === null;
    // partner_approved only gates people who ARE partners; staff don't have one to wait for.
    const awaitingApproval = row.emp_type === "partner" && row.partner_approved === 0;
    // A network partner may NOT build a network of their own.
    //
    // The commission engine pays exactly two levels: the seller's 10%, and 2% to whoever recruited
    // them. There is no third. Letting a partner recruit would still book those two rows — so it
    // would appear to work — while quietly creating a recruitment chain that was never designed,
    // never priced against a ₹26/page product, and turns "sell to students" into "recruit people
    // who recruit people". Easy to allow later; very hard to take back once partners have
    // downlines. Staff (employees and interns) build networks; partners sell.
    const isPartner = row.emp_type === "partner";
    return { id: row.id, isBd: live && !awaitingApproval && !isPartner, role: String(row.role || ""), isPartner };
  });
}

export type PartnerPerson = {
  id: string; name: string; role: string; code: string;
  direct_sales: number; direct_earned: number; direct_pending: number;
  override_earned: number; override_pending: number;
  network: NetworkPartner[];
};

/** Every active person, each with their OWN code + direct-sale commission, the 2% override they
 *  earn as an upline, and the network under them. Powers the owner's all-people network view
 *  (everyone can host a network now — not just those who already have a downline). */
export async function listAllPartnerPeople(): Promise<PartnerPerson[]> {
  return withClient(async (c) => {
    let emps: any[] = [];
    try {
      emps = (await c.query(
        `SELECT id, name, role, emp_type FROM employees
         WHERE active=1 AND COALESCE(deleted_at::text,'')='' ORDER BY name`)).rows;
    } catch { return []; }
    const out: PartnerPerson[] = [];
    for (const e of emps) {
      const code = (await c.query(
        `SELECT code FROM partner_codes WHERE employee_id=$1 ORDER BY created_at LIMIT 1`, [e.id])).rows[0]?.code || "";
      const d = (await c.query(
        `SELECT COALESCE(SUM(order_amount_inr),0) sales, COALESCE(SUM(commission_inr),0) earned,
                COALESCE(SUM(CASE WHEN status='pending' THEN commission_inr ELSE 0 END),0) pending
         FROM employee_commissions WHERE employee_id=$1 AND tier='direct' AND status<>'void'`, [e.id])).rows[0];
      const ov = (await c.query(
        `SELECT COALESCE(SUM(commission_inr),0) earned,
                COALESCE(SUM(CASE WHEN status='pending' THEN commission_inr ELSE 0 END),0) pending
         FROM employee_commissions WHERE employee_id=$1 AND tier='override' AND status<>'void'`, [e.id])).rows[0];
      const network = await networkOf(c, e.id);
      out.push({
        id: e.id, name: e.name,
        role: roleLabel(e, { withTrack: false }),
        code,
        direct_sales: r2(d.sales), direct_earned: r2(d.earned), direct_pending: r2(d.pending),
        override_earned: r2(ov.earned), override_pending: r2(ov.pending),
        network,
      });
    }
    return out;
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

/**
 * Everyone the owner can put a partner under. Any active employee qualifies — a partner who
 * walks in directly can be handed to whoever deserves them as a reward, and that person then
 * earns the override on their sales.
 */
export async function listAssignableParents(): Promise<{ id: string; name: string; role: string }[]> {
  return withClient(async (c) => {
    try {
      return (await c.query(
        `SELECT id, name, COALESCE(role,'') AS role FROM employees
          WHERE (active IS NULL OR active=1) AND (deleted_at IS NULL)
          ORDER BY name`)).rows;
    } catch { return []; }
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
/**
 * Remove someone from the team.
 *
 * Removing a person has to reach everything they can still act through, or they stay half-present:
 * the code they hold keeps discounting orders and booking commission to someone who has gone.
 * This used to set two columns and stop there.
 *
 * Their commission rows are deliberately left alone — that is money actually earned, and the
 * record has to outlive the person. It is purged with them a year later.
 *
 * Returns their email so the caller can also switch them off in scheduling, which lives in a
 * different database entirely and therefore hears about none of this on its own.
 */
export async function softDeleteEmployee(id: string): Promise<{ email: string; name: string; codes: number }> {
  return withClient(async (c) => {
    const who = (await c.query(`SELECT name, email FROM employees WHERE id=$1`, [id])).rows[0] || {};
    await c.query(`UPDATE employees SET deleted_at=$1, active=0 WHERE id=$2`, [new Date().toISOString(), id]);
    let codes = 0;
    try {
      const r = await c.query(`UPDATE partner_codes SET active=0 WHERE employee_id=$1 RETURNING code`, [id]);
      codes = r.rows.length;
    } catch { /* partner_codes may not exist on a fresh database */ }
    try { await c.query(`UPDATE promo_codes SET active=0 WHERE employee_id=$1`, [id]); } catch { /* same */ }
    return { email: String(who.email || ""), name: String(who.name || ""), codes };
  });
}

/** Undo it — including the codes, or someone restored comes back unable to earn. */
export async function restoreEmployee(id: string): Promise<{ email: string; name: string }> {
  return withClient(async (c) => {
    const who = (await c.query(`SELECT name, email FROM employees WHERE id=$1`, [id])).rows[0] || {};
    await c.query(`UPDATE employees SET deleted_at=NULL, active=1 WHERE id=$1`, [id]);
    try { await c.query(`UPDATE partner_codes SET active=1 WHERE employee_id=$1`, [id]); } catch { /* */ }
    return { email: String(who.email || ""), name: String(who.name || "") };
  });
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
      // Their work log goes with them — anything referencing an employee must be cleared here,
      // or a purge leaves orphan rows pointing at an id that no longer exists.
      for (const t of ["portal_tasks", "portal_reviews"]) {
        try { await c.query(`DELETE FROM ${t} WHERE employee_id = ANY($1)`, [ids]); } catch { /* table may predate this */ }
      }
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

// ── Registration kinds ("I am registering as") ───────────────────────────────
export type RegType = { key: string; label: string; enabled: boolean; sort: number; terms: string | null; inUse?: number; roles?: number };

/**
 * `partner` is NOT a registration kind and must never become one.
 *
 * Network partners are recruited and approved through the network flow, not by filling in the
 * onboarding form — and emp_type "partner" carries real rules with it (their own dashboard, the
 * 2% override, no network of their own). Letting someone appear on the public form and self-select
 * into it would hand out those rules to whoever found the link.
 */
export const RESERVED_REG_KEYS = ["partner"];

/**
 * Anything that READS as a partner, not just the exact key.
 *
 * Blocking only "partner" was not enough: "Network Partner" becomes the key `network_partner`,
 * sailed through, and appeared on the public form as an option — which is precisely the confusion
 * the reservation exists to prevent, whatever the key underneath happens to be.
 */
export function isReservedRegKey(key: string): boolean {
  const k = (key || "").trim().toLowerCase();
  if (RESERVED_REG_KEYS.includes(k)) return true;
  return /(^|_)partners?(_|$)/.test(k);
}

/** A label typed by a person → a stable key. "Consultant (part-time)" → "consultant_part_time". */
export function regKeyFrom(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

export async function listRegTypes(includeArchived = false): Promise<RegType[]> {
  return (await withClient(async (c) => {
    const r = await c.query(
      `SELECT rt.key, rt.label, rt.enabled, rt.sort, rt.terms,
              (SELECT COUNT(*)::int FROM employees e WHERE e.emp_type = rt.key AND e.deleted_at IS NULL) AS in_use,
              -- How many roles are set up for this kind. A kind with none is offered on the form
              -- but leads to an empty track list, so the owner needs to see that where they can
              -- fix it rather than discovering it on the public form.
              (SELECT COUNT(*)::int FROM track_settings ts
                WHERE COALESCE(ts.archived,FALSE)=FALSE AND COALESCE(ts.default_emp_type,'intern') = rt.key) AS roles
         FROM reg_types rt
        WHERE $1 OR COALESCE(rt.archived,FALSE) = FALSE
        ORDER BY rt.sort, rt.label`, [includeArchived]);
    return r.rows.map((x: any) => ({
      key: x.key, label: x.label, enabled: x.enabled !== false, sort: +x.sort || 0,
      terms: x.terms || null, inUse: +x.in_use || 0, roles: +x.roles || 0,
    }));
  })) || [];
}

export async function upsertRegType(t: { key: string; label: string; enabled: boolean; sort?: number; terms?: string | null }) {
  const key = t.key.trim().toLowerCase();
  if (!key || isReservedRegKey(key)) throw new Error("That name is reserved");
  return withClient((c) => c.query(
    `INSERT INTO reg_types (key,label,enabled,sort,terms) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (key) DO UPDATE SET label=$2, enabled=$3, sort=$4, terms=$5, archived=FALSE`,
    [key, t.label.trim() || key, t.enabled, t.sort ?? 100, t.terms ?? null]));
}

/**
 * Remove a kind — really remove it, unless somebody is holding it.
 *
 * The first version always archived, which meant "Remove" quietly behaved as "Hide": the row stayed
 * in the list marked Hidden and never went away. The reason for archiving is real but narrow —
 * people already carry this key in employees.emp_type, and deleting it would leave their record
 * pointing at a kind nothing can name. That reason does not apply when nobody has ever joined as
 * it, which is exactly the case for one added by mistake.
 *
 * So: in use → hidden and kept, and the caller is told. Unused → gone.
 */
export async function removeRegType(key: string): Promise<{ removed: boolean; inUse: number }> {
  const k = key.trim().toLowerCase();
  if (RESERVED_REG_KEYS.includes(k)) throw new Error("That kind cannot be removed");
  return (await withClient(async (c) => {
    const r = await c.query(
      `SELECT COUNT(*)::int n FROM employees WHERE emp_type=$1 AND deleted_at IS NULL`, [k]);
    const inUse = +r.rows[0]?.n || 0;
    if (inUse > 0) {
      await c.query(`UPDATE reg_types SET archived=TRUE, enabled=FALSE WHERE key=$1`, [k]);
      return { removed: false, inUse };
    }
    await c.query(`DELETE FROM reg_types WHERE key=$1`, [k]);
    return { removed: true, inUse: 0 };
  }))!;
}

// ── Full role config (onboarding form + legal) ───────────────────────────────
export type RoleConfig = {
  track: string; commission_enabled: boolean; paid: boolean; salary: number | null;
  salary_period: string | null; scope: string | null; terms: string | null; sensitive: boolean; default_emp_type: string;
  /** Owner-saved baseline restored by "Reset to default"; null = use the built-in template. */
  default_terms?: string | null;
  /** The joining letter for this role; null = build it from the template. */
  joining_letter?: string | null;
  joining_letter_default?: string | null;
};
export async function listRoles(): Promise<RoleConfig[]> {
  return withClient(async (c) => {
    const r = await c.query(`
      SELECT t.track, COALESCE(ts.commission_enabled,TRUE) commission_enabled, COALESCE(ts.paid,FALSE) paid,
             ts.salary, ts.salary_period, ts.scope, ts.terms, ts.default_terms,
             ts.joining_letter, ts.joining_letter_default, COALESCE(ts.sensitive,FALSE) sensitive,
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
      joining_letter: x.joining_letter || null, joining_letter_default: x.joining_letter_default || null,
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
/** Save (or clear) the joining letter for one role. Mirrors setRoleDefaultTerms below. */
export async function setRoleJoiningLetter(track: string, text: string | null, alsoDefault = false) {
  return withClient((c) => c.query(
    alsoDefault
      ? `INSERT INTO track_settings (track, joining_letter, joining_letter_default) VALUES ($1,$2,$2)
         ON CONFLICT (track) DO UPDATE SET joining_letter=$2, joining_letter_default=$2, archived=FALSE`
      : `INSERT INTO track_settings (track, joining_letter) VALUES ($1,$2)
         ON CONFLICT (track) DO UPDATE SET joining_letter=$2, archived=FALSE`,
    [track.trim(), text]));
}

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
      `SELECT id,name,email,mobile,dob,address,start_date,duration,emp_type,track,role,
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

// ══════════════════════════════════════════════════════════════════════════════
// WORK LOG — tasks, weekly reviews, and the numbers a review should be based on
// ══════════════════════════════════════════════════════════════════════════════

/** One person by id — for the documents that name them (work log, performance report). */
export async function getEmployeeById(id: string) {
  return withClient(async (c) => {
    const r = await c.query(
      `SELECT id, name, email, role, emp_type, track, start_date, duration
         FROM employees WHERE id=$1 AND deleted_at IS NULL LIMIT 1`, [id]);
    return r.rows[0] || null;
  });
}

export type Task = {
  id: string; employee_id: string; seq: number; title: string; detail: string | null;
  source: "owner" | "self";
  assigned_at: string; due_at: string | null; done_at: string | null; delivered_at: string | null;
};

/** The five things every review scores, whoever the person is. Deliberately not intern-specific
 *  — the same five read sensibly for an intern, an employee or a network partner. */
export const REVIEW_CRITERIA = [
  { id: "completion", label: "Task completion" },
  { id: "quality", label: "Work quality" },
  { id: "timeliness", label: "Timeliness" },
  { id: "communication", label: "Communication" },
  { id: "ownership", label: "Ownership & initiative" },
] as const;

export type Review = {
  id: string; employee_id: string; week_start: string;
  scores: Record<string, number>;
  metrics: { name: string; target?: string; actual?: string; score?: number }[];
  note: string | null; created_at: string; updated_at: string;
};

const iso = (v: unknown): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
};
const asTask = (r: any): Task => ({
  id: r.id, employee_id: r.employee_id, seq: Number(r.seq), title: r.title, detail: r.detail ?? null,
  source: r.source === "owner" ? "owner" : "self",
  assigned_at: iso(r.assigned_at) || new Date().toISOString(),
  due_at: iso(r.due_at), done_at: iso(r.done_at), delivered_at: iso(r.delivered_at),
});

/**
 * Was it delivered on time?
 *
 * Only ever answered from the two timestamps, never stored — a stored flag would keep saying
 * "on time" after someone edited the deadline. A task with no deadline can't be late; a task
 * that isn't delivered yet is overdue only once its deadline has actually passed.
 */
export type TaskStatus = "on_time" | "late" | "pending" | "overdue" | "no_deadline";
export function taskStatus(t: Task, now = Date.now()): TaskStatus {
  if (t.delivered_at) {
    if (!t.due_at) return "no_deadline";
    return Date.parse(t.delivered_at) <= Date.parse(t.due_at) ? "on_time" : "late";
  }
  if (!t.due_at) return "pending";
  return now > Date.parse(t.due_at) ? "overdue" : "pending";
}

export async function listTasks(employeeId: string): Promise<Task[]> {
  return withClient(async (c) => {
    const r = await c.query(`SELECT * FROM portal_tasks WHERE employee_id=$1 ORDER BY seq`, [employeeId]);
    return r.rows.map(asTask);
  });
}

/** Every task in the company, newest first — the owner's single view across people. */
export async function listAllTasks(): Promise<(Task & { name: string; role: string | null })[]> {
  return withClient(async (c) => {
    const r = await c.query(
      `SELECT t.*, e.name, e.role FROM portal_tasks t JOIN employees e ON e.id = t.employee_id
       WHERE e.deleted_at IS NULL ORDER BY t.assigned_at DESC`);
    return r.rows.map((x) => ({ ...asTask(x), name: x.name, role: x.role }));
  });
}

export async function addTask(input: {
  employeeId: string; title: string; detail?: string; dueAt?: string | null; source: "owner" | "self";
}): Promise<Task> {
  const title = input.title.trim().slice(0, 500);
  if (!title) throw new Error("Write the task first");
  return withClient(async (c) => {
    // Serial per person, computed from what is already there so numbers stay 1..n even after a
    // deletion. Taken inside the same statement as the insert so two quick adds can't collide.
    const r = await c.query(
      `INSERT INTO portal_tasks (id, employee_id, seq, title, detail, source, due_at)
       VALUES ($1, $2, (SELECT COALESCE(MAX(seq),0)+1 FROM portal_tasks WHERE employee_id=$2), $3, $4, $5, $6)
       RETURNING *`,
      [randomUUID(), input.employeeId, title, (input.detail || "").trim().slice(0, 4000) || null,
       input.source, input.dueAt || null]);
    return asTask(r.rows[0]);
  });
}

/** The person says they've finished (or un-says it). Not the same as the owner accepting it. */
export async function markTaskDone(id: string, employeeId: string, done: boolean) {
  return withClient((c) => c.query(
    `UPDATE portal_tasks SET done_at = ${done ? "now()" : "NULL"} WHERE id=$1 AND employee_id=$2`,
    [id, employeeId]));
}

/** The owner accepting it — this is what counts as delivered, and what decides on-time vs late. */
export async function markTaskDelivered(id: string, delivered: boolean) {
  return withClient((c) => c.query(
    `UPDATE portal_tasks SET delivered_at = ${delivered ? "COALESCE(delivered_at, now())" : "NULL"} WHERE id=$1`,
    [id]));
}

export async function updateTask(id: string, fields: { title?: string; detail?: string; dueAt?: string | null }) {
  return withClient(async (c) => {
    const sets: string[] = [], vals: any[] = [id];
    if (fields.title !== undefined) { sets.push(`title=$${vals.length + 1}`); vals.push(fields.title.trim().slice(0, 500)); }
    if (fields.detail !== undefined) { sets.push(`detail=$${vals.length + 1}`); vals.push(fields.detail.trim().slice(0, 4000) || null); }
    if (fields.dueAt !== undefined) { sets.push(`due_at=$${vals.length + 1}`); vals.push(fields.dueAt || null); }
    if (!sets.length) return;
    await c.query(`UPDATE portal_tasks SET ${sets.join(", ")} WHERE id=$1`, vals);
  });
}

/**
 * Hand a task to someone else — either as well as, or instead of, the person who has it.
 *
 * `copy` leaves the original where it is and gives the same work to a second person; without it
 * the task moves. Either way the task is renumbered for whoever receives it, because the serial
 * runs per person and a task arriving with someone else's number would break the sequence.
 */
export async function giveTaskTo(id: string, toEmployeeId: string, copy: boolean): Promise<Task | null> {
  return withClient(async (c) => {
    const t = (await c.query(`SELECT * FROM portal_tasks WHERE id=$1`, [id])).rows[0];
    if (!t) return null;
    if (t.employee_id === toEmployeeId) return asTask(t);   // already theirs; nothing to do

    if (copy) {
      const r = await c.query(
        `INSERT INTO portal_tasks (id, employee_id, seq, title, detail, source, due_at)
         VALUES ($1, $2, (SELECT COALESCE(MAX(seq),0)+1 FROM portal_tasks WHERE employee_id=$2), $3, $4, 'owner', $5)
         RETURNING *`,
        [randomUUID(), toEmployeeId, t.title, t.detail, t.due_at]);
      return asTask(r.rows[0]);
    }
    const r = await c.query(
      `UPDATE portal_tasks
          SET employee_id=$2,
              seq=(SELECT COALESCE(MAX(seq),0)+1 FROM portal_tasks WHERE employee_id=$2),
              source='owner'
        WHERE id=$1 RETURNING *`, [id, toEmployeeId]);
    return r.rows[0] ? asTask(r.rows[0]) : null;
  });
}

/** Delete a task. `employeeId` scopes it so one person can never remove another's row. */
export async function deleteTask(id: string, employeeId?: string) {
  return withClient((c) => employeeId
    ? c.query(`DELETE FROM portal_tasks WHERE id=$1 AND employee_id=$2`, [id, employeeId])
    : c.query(`DELETE FROM portal_tasks WHERE id=$1`, [id]));
}

// ── Weekly reviews ───────────────────────────────────────────────────────────

/** The Monday of a date's week, in IST — the team's week, not UTC's. */
export function weekStartIST(d: Date | string = new Date()): string {
  const t = typeof d === "string" ? new Date(d) : d;
  const ist = new Date(t.getTime() + 5.5 * 3600 * 1000);
  const dow = (ist.getUTCDay() + 6) % 7; // Monday = 0
  ist.setUTCDate(ist.getUTCDate() - dow);
  return ist.toISOString().slice(0, 10);
}

const asReview = (r: any): Review => ({
  id: r.id, employee_id: r.employee_id, week_start: String(r.week_start).slice(0, 10),
  scores: (r.scores && typeof r.scores === "object") ? r.scores : {},
  metrics: Array.isArray(r.metrics) ? r.metrics : [],
  note: r.note ?? null,
  created_at: iso(r.created_at) || "", updated_at: iso(r.updated_at) || "",
});

export async function listReviews(employeeId: string): Promise<Review[]> {
  return withClient(async (c) => {
    const r = await c.query(
      `SELECT * FROM portal_reviews WHERE employee_id=$1 ORDER BY week_start DESC`, [employeeId]);
    return r.rows.map(asReview);
  });
}

/** Save a week's review. Re-opening the same week edits it instead of adding a second one. */
export async function saveReview(input: {
  employeeId: string; weekStart: string;
  scores: Record<string, number>;
  metrics?: { name: string; target?: string; actual?: string; score?: number }[];
  note?: string;
}): Promise<Review> {
  // Only the known criteria, only 1-5 — a stray key or a 9 would quietly skew every average.
  const clean: Record<string, number> = {};
  for (const c of REVIEW_CRITERIA) {
    const n = Math.round(Number(input.scores?.[c.id]));
    if (Number.isFinite(n) && n >= 1 && n <= 5) clean[c.id] = n;
  }
  const metrics = (input.metrics || []).slice(0, 20).map((m) => ({
    name: String(m.name || "").trim().slice(0, 120),
    target: String(m.target ?? "").trim().slice(0, 60),
    actual: String(m.actual ?? "").trim().slice(0, 60),
    score: Number.isFinite(Number(m.score)) ? Math.max(1, Math.min(5, Math.round(Number(m.score)))) : undefined,
  })).filter((m) => m.name);

  return withClient(async (c) => {
    const r = await c.query(
      `INSERT INTO portal_reviews (id, employee_id, week_start, scores, metrics, note)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6)
       ON CONFLICT (employee_id, week_start)
       DO UPDATE SET scores=$4::jsonb, metrics=$5::jsonb, note=$6, updated_at=now()
       RETURNING *`,
      [randomUUID(), input.employeeId, input.weekStart, JSON.stringify(clean), JSON.stringify(metrics),
       (input.note || "").trim().slice(0, 4000) || null]);
    return asReview(r.rows[0]);
  });
}

export async function deleteReview(id: string) {
  return withClient((c) => c.query(`DELETE FROM portal_reviews WHERE id=$1`, [id]));
}

// ── The numbers a review should be based on ──────────────────────────────────

export type WorkStats = {
  total: number; delivered: number; onTime: number; late: number; overdue: number; pending: number;
  onTimePct: number | null;      // of delivered tasks that had a deadline
  deliveredPct: number | null;
  assignedByOwner: number; selfSet: number;
};

/** Task counts over a set of tasks — the factual half of a review, so a score isn't a guess. */
export function workStats(tasks: Task[], now = Date.now()): WorkStats {
  const s: WorkStats = { total: tasks.length, delivered: 0, onTime: 0, late: 0, overdue: 0, pending: 0,
    onTimePct: null, deliveredPct: null, assignedByOwner: 0, selfSet: 0 };
  for (const t of tasks) {
    if (t.source === "owner") s.assignedByOwner++; else s.selfSet++;
    switch (taskStatus(t, now)) {
      case "on_time": s.delivered++; s.onTime++; break;
      case "late": s.delivered++; s.late++; break;
      case "no_deadline": s.delivered++; break;
      case "overdue": s.overdue++; break;
      default: s.pending++;
    }
  }
  const withDeadline = s.onTime + s.late;
  if (withDeadline > 0) s.onTimePct = Math.round((s.onTime / withDeadline) * 100);
  if (s.total > 0) s.deliveredPct = Math.round((s.delivered / s.total) * 100);
  return s;
}

/** Tasks assigned inside a given week (Monday→Sunday IST). */
export function tasksInWeek(tasks: Task[], weekStart: string): Task[] {
  const from = Date.parse(`${weekStart}T00:00:00+05:30`);
  const to = from + 7 * 24 * 3600 * 1000;
  return tasks.filter((t) => {
    const at = Date.parse(t.assigned_at);
    return at >= from && at < to;
  });
}

/** Average of a review's five scores, out of 5. */
export function reviewAverage(r: Review): number | null {
  const vals = REVIEW_CRITERIA.map((c) => r.scores[c.id]).filter((n) => Number.isFinite(n));
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

export type TenureScore = {
  weeks: number;
  average: number | null;          // mean of every week's average, out of 5
  perCriterion: Record<string, number>;
  stats: WorkStats;                // whole tenure, not one week
  band: string;                    // plain-language summary of the average
};

/**
 * The whole-tenure picture: every weekly review averaged, plus the task record behind it.
 *
 * Weeks are weighted equally rather than by number of tasks — a quiet week shouldn't count for
 * less when judging how someone worked.
 */
export function tenureScore(reviews: Review[], tasks: Task[]): TenureScore {
  const perCriterion: Record<string, number> = {};
  for (const c of REVIEW_CRITERIA) {
    const vals = reviews.map((r) => r.scores[c.id]).filter((n) => Number.isFinite(n));
    if (vals.length) perCriterion[c.id] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  }
  const weekAvgs = reviews.map(reviewAverage).filter((n): n is number => n != null);
  const average = weekAvgs.length
    ? Math.round((weekAvgs.reduce((a, b) => a + b, 0) / weekAvgs.length) * 10) / 10
    : null;
  const band = average == null ? "Not yet reviewed"
    : average >= 4.5 ? "Outstanding"
    : average >= 3.5 ? "Exceeds expectations"
    : average >= 2.5 ? "Meets expectations"
    : average >= 1.5 ? "Needs development"
    : "Below expectations";
  return { weeks: reviews.length, average, perCriterion, stats: workStats(tasks), band };
}
