/**
 * Partner Portal DB layer — talks to the SAME database LivoDraft uses (single source
 * of truth). The employees + employee_commissions tables live in LivoDraft's Postgres;
 * LivoDraft writes commissions at payment, this portal reads them + manages employees +
 * payouts. Set env LIVODRAFT_DATABASE_URL to LivoDraft's DATABASE_URL.
 *
 * Server-only. Never import from a client component.
 */
import { Pool, type PoolClient } from "pg";
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
  // soft-delete: records kept, hard-purged 1 year after deleted_at
  await add("deleted_at");
  // password reset (forgot-password flow)
  await add("reset_token");
  await add("reset_expires");
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

/** All LivoDraft promo codes linked to an employee, grouped by employee_id.
 *  Defensive: a missing promo_codes table must not break the dashboard. */
async function employeeCodesMap(c: PoolClient): Promise<Record<string, EmployeeCode[]>> {
  try {
    const r = await c.query(
      `SELECT employee_id, code, commission_pct, active, uses FROM promo_codes
       WHERE employee_id IS NOT NULL AND employee_id <> ''`);
    const map: Record<string, EmployeeCode[]> = {};
    for (const row of r.rows) {
      (map[row.employee_id] ||= []).push({
        code: row.code, commission_pct: +row.commission_pct, active: +row.active, uses: +(row.uses || 0),
      });
    }
    return map;
  } catch {
    return {};
  }
}

const PROFILE_COLS = "e.dob,e.address,e.id_type,e.id_number,e.is_student,e.college,e.student_id,e.start_date,e.duration";

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

/** Onboarding form → shared registry. Dedup by email: create if new, else update the
 *  profile fields (never touch password/commission on an existing row). */
export async function upsertEmployeeFromOnboarding(data: {
  name: string; email: string; mobile?: string; emp_type?: string; track?: string;
  dob?: string; address?: string; id_type?: string; id_number?: string;
  is_student?: string; college?: string; student_id?: string; start_date?: string; duration?: string;
}): Promise<{ id: string; created: boolean }> {
  return withClient(async (c) => {
    const prof = [
      (data.dob || "").trim(), (data.address || "").trim(), (data.id_type || "").trim(),
      (data.id_number || "").trim(), (data.is_student || "").trim(), (data.college || "").trim(),
      (data.student_id || "").trim(), (data.start_date || "").trim(), (data.duration || "").trim(),
    ];
    const ex = await c.query(`SELECT id FROM employees WHERE LOWER(email)=LOWER($1) LIMIT 1`, [data.email]);
    if (ex.rows[0]) {
      await c.query(
        `UPDATE employees SET name=$1, mobile=$2, emp_type=$3, track=$4,
           dob=$5,address=$6,id_type=$7,id_number=$8,is_student=$9,college=$10,student_id=$11,start_date=$12,duration=$13,
           deleted_at=NULL WHERE id=$14`,
        [data.name.trim(), (data.mobile || "").trim(), data.emp_type || "intern", data.track || "", ...prof, ex.rows[0].id]);
      return { id: ex.rows[0].id, created: false };
    }
    const id = randomUUID();
    await c.query(
      `INSERT INTO employees (id,name,email,mobile,emp_type,track,commission_pct,active,source,
         dob,address,id_type,id_number,is_student,college,student_id,start_date,duration)
       VALUES ($1,$2,$3,$4,$5,$6,10,1,'onboarding',$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
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
