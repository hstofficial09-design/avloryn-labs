import { redirect } from "next/navigation";
import { getSession } from "@/lib/portal-auth";
import {
  listEmployeesWithSummary, listCommissionOrders, employeeOwnData,
  listDeletedEmployees, allEmployeeNames, purgeExpiredEmployees, commissionTracksMap, trackHasCommission,
  companyGmv, partnerSelf, partnerUsers,
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
    let gmv = 0;
    try {
      await purgeExpiredEmployees().catch(() => 0);
      employees = await listEmployeesWithSummary();
      orders = await listCommissionOrders();
      deleted = await listDeletedEmployees();
      names = await allEmployeeNames();
      trackMap = await commissionTracksMap();
      gmv = await companyGmv().catch(() => 0);
    } catch (e: any) {
      error = e?.message || "Could not reach the commissions database.";
    }
    return <OwnerDashboard employees={employees} orders={orders} deleted={deleted} names={names} trackMap={trackMap} gmv={gmv} error={error} />;
  }

  let data: any = null, error: string | null = null, commissionRole = true;
  let bdName = "", users: any[] = [], isPartner = false, refLink = "", refCode = "";
  const livo = (process.env.LIVODRAFT_API_URL || "https://livodraft.com").replace(/\/+$/, "");
  try {
    data = await employeeOwnData(s.email);
    const map = await commissionTracksMap();
    commissionRole = trackHasCommission(data?.employee?.track, map);
    // If this person is a network partner, show WHO their BD is, the buyers under them, and their
    // shareable referral link + QR (derived from their active referral code).
    const self = await partnerSelf(s.email).catch(() => null);
    if (self?.isPartner) {
      isPartner = true;
      bdName = self.bd_name || "";
      users = await partnerUsers([self.id]).catch(() => []);
      refCode = self.ref_code || "";
      if (refCode) refLink = `${livo}/login?ref=${encodeURIComponent(refCode)}`;
    }
  } catch (e: any) {
    error = e?.message || "Could not reach the commissions database.";
  }
  return <EmployeeDashboard name={s.name || "there"} data={data} error={error} commissionRole={commissionRole} isPartner={isPartner} bdName={bdName} users={users} refCode={refCode} refLink={refLink} livoBase={livo} />;
}
