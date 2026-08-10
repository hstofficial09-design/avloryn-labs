import { redirect } from "next/navigation";
import { getSession } from "@/lib/portal-auth";
import {
  listEmployeesWithSummary, listCommissionOrders, employeeOwnData,
  listDeletedEmployees, allEmployeeNames, purgeExpiredEmployees, commissionTracksMap, trackHasCommission,
} from "@/lib/portal-db";
import OwnerDashboard from "../OwnerDashboard";
import EmployeeDashboard from "../EmployeeDashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "Commissions — Avloryn Labs", robots: { index: false, follow: false } };

export default async function CommissionsPage() {
  const s = await getSession();
  if (!s) redirect("/portal/login?next=/portal/commissions");

  if (s.role === "owner") {
    let employees: any[] = [], orders: any[] = [], deleted: any[] = [], names: Record<string, string> = {}, trackMap: Record<string, boolean> = {}, error: string | null = null;
    try {
      await purgeExpiredEmployees().catch(() => 0);
      employees = await listEmployeesWithSummary();
      orders = await listCommissionOrders();
      deleted = await listDeletedEmployees();
      names = await allEmployeeNames();
      trackMap = await commissionTracksMap();
    } catch (e: any) {
      error = e?.message || "Could not reach the commissions database.";
    }
    return <OwnerDashboard employees={employees} orders={orders} deleted={deleted} names={names} trackMap={trackMap} error={error} />;
  }

  let data: any = null, error: string | null = null, commissionRole = true;
  try {
    data = await employeeOwnData(s.email);
    const map = await commissionTracksMap();
    commissionRole = trackHasCommission(data?.employee?.track, map);
  } catch (e: any) {
    error = e?.message || "Could not reach the commissions database.";
  }
  return <EmployeeDashboard name={s.name || "there"} data={data} error={error} commissionRole={commissionRole} />;
}
