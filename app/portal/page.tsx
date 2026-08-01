import { redirect } from "next/navigation";
import { getSession } from "@/lib/portal-auth";
import {
  listEmployeesWithSummary, listCommissionOrders, employeeOwnData,
  listDeletedEmployees, allEmployeeNames, purgeExpiredEmployees,
} from "@/lib/portal-db";
import OwnerDashboard from "./OwnerDashboard";
import EmployeeDashboard from "./EmployeeDashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "Partner Portal — Avloryn Labs", robots: { index: false, follow: false } };

export default async function PortalPage() {
  const s = await getSession();
  if (!s) redirect("/portal/login");

  if (s.role === "owner") {
    let employees: any[] = [], orders: any[] = [], deleted: any[] = [], names: Record<string, string> = {}, error: string | null = null;
    try {
      await purgeExpiredEmployees().catch(() => 0); // opportunistic 1-year hard-purge of soft-deleted
      employees = await listEmployeesWithSummary();
      orders = await listCommissionOrders();
      deleted = await listDeletedEmployees();
      names = await allEmployeeNames();
    } catch (e: any) {
      error = e?.message || "Could not reach the commissions database.";
    }
    return <OwnerDashboard employees={employees} orders={orders} deleted={deleted} names={names} error={error} />;
  }

  let data: any = null, error: string | null = null;
  try {
    data = await employeeOwnData(s.email);
  } catch (e: any) {
    error = e?.message || "Could not reach the commissions database.";
  }
  return <EmployeeDashboard name={s.name || "there"} data={data} error={error} />;
}
