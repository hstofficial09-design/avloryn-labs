import { redirect } from "next/navigation";
import { getSession } from "@/lib/portal-auth";
import { listEmployeesWithSummary, listCommissionOrders, employeeOwnData } from "@/lib/portal-db";
import OwnerDashboard from "./OwnerDashboard";
import EmployeeDashboard from "./EmployeeDashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "Partner Portal — Avloryn Labs", robots: { index: false, follow: false } };

export default async function PortalPage() {
  const s = await getSession();
  if (!s) redirect("/portal/login");

  if (s.role === "owner") {
    let employees: any[] = [], orders: any[] = [], error: string | null = null;
    try {
      employees = await listEmployeesWithSummary();
      orders = await listCommissionOrders();
    } catch (e: any) {
      error = e?.message || "Could not reach the commissions database.";
    }
    return <OwnerDashboard employees={employees} orders={orders} error={error} />;
  }

  let data: any = null, error: string | null = null;
  try {
    data = await employeeOwnData(s.email);
  } catch (e: any) {
    error = e?.message || "Could not reach the commissions database.";
  }
  return <EmployeeDashboard name={s.name || "there"} data={data} error={error} />;
}
