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

/** Additive, idempotent: the portal owns the employee login credential. */
async function ensureSchema(c: PoolClient) {
  if (schemaReady) return;
  await c.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_hash TEXT`);
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

export type Employee = {
  id: string; name: string; email: string | null; mobile: string | null;
  emp_type: string; track: string | null; commission_pct: number;
  active: number; source: string; has_password?: boolean;
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

export async function listEmployeesWithSummary(): Promise<EmployeeSummary[]> {
  return withClient(async (c) => {
    const r = await c.query(`
      SELECT e.id,e.name,e.email,e.mobile,e.emp_type,e.track,e.commission_pct,e.active,e.source,
             (e.password_hash IS NOT NULL AND e.password_hash<>'') AS has_password,
             COUNT(ec.id)::int AS orders,
             COALESCE(SUM(ec.order_amount_inr),0) AS sales,
             COALESCE(SUM(ec.commission_inr),0) AS earned,
             COALESCE(SUM(CASE WHEN ec.status='pending' THEN ec.commission_inr ELSE 0 END),0) AS pending,
             COALESCE(SUM(CASE WHEN ec.status='paid' THEN ec.commission_inr ELSE 0 END),0) AS paid
      FROM employees e LEFT JOIN employee_commissions ec ON ec.employee_id=e.id
      GROUP BY e.id ORDER BY e.created_at DESC`);
    return r.rows.map(roundSummary);
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
 *  human fields (never touch password/commission on an existing row). */
export async function upsertEmployeeFromOnboarding(data: {
  name: string; email: string; mobile?: string; emp_type?: string; track?: string;
}): Promise<{ id: string; created: boolean }> {
  return withClient(async (c) => {
    const ex = await c.query(`SELECT id FROM employees WHERE LOWER(email)=LOWER($1) LIMIT 1`, [data.email]);
    if (ex.rows[0]) {
      await c.query(
        `UPDATE employees SET name=$1, mobile=$2, emp_type=$3, track=$4 WHERE id=$5`,
        [data.name.trim(), (data.mobile || "").trim(), data.emp_type || "intern", data.track || "", ex.rows[0].id]);
      return { id: ex.rows[0].id, created: false };
    }
    const id = randomUUID();
    await c.query(
      `INSERT INTO employees (id,name,email,mobile,emp_type,track,commission_pct,active,source)
       VALUES ($1,$2,$3,$4,$5,$6,10,1,'onboarding')`,
      [id, data.name.trim(), data.email.trim(), (data.mobile || "").trim(), data.emp_type || "intern", data.track || ""]);
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
