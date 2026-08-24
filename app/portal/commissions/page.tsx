import { redirect } from "next/navigation";
import { getSession } from "@/lib/portal-auth";
import {
  listEmployeesWithSummary, listCommissionOrders, employeeOwnData,
  listDeletedEmployees, allEmployeeNames, purgeExpiredEmployees, commissionTracksMap, trackHasCommission,
  companyGmv, partnerSelf, partnerUsers, employeePromoCodes,
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
      // Six independent reads. Waiting for each before starting the next meant paying the round
      // trip to the database six times over — about a second and a half of staring at nothing, on
      // a page opened constantly. Nothing here depends on anything else here, so they go together.
      //
      // The yearly purge of long-deleted records is housekeeping, not part of this page: it runs
      // alongside and its result is not read. Waiting on it only ever made the page slower.
      purgeExpiredEmployees().catch(() => 0);
      [employees, orders, deleted, names, trackMap, gmv] = await Promise.all([
        listEmployeesWithSummary(),
        listCommissionOrders(),
        listDeletedEmployees(),
        allEmployeeNames(),
        commissionTracksMap(),
        companyGmv().catch(() => 0),
      ]);
    } catch (e: any) {
      error = e?.message || "Could not reach the commissions database.";
    }
    return <OwnerDashboard employees={employees} orders={orders} deleted={deleted} names={names} trackMap={trackMap} gmv={gmv} error={error} />;
  }

  let data: any = null, error: string | null = null, commissionRole = true;
  let bdName = "", users: any[] = [], isPartner = false, refLink = "", refCode = "", promoCodes: any[] = [];
  const livo = (process.env.LIVODRAFT_API_URL || "https://livodraft.com").replace(/\/+$/, "");
  try {
    data = await employeeOwnData(s.email);
    const map = await commissionTracksMap();
    commissionRole = trackHasCommission(data?.employee?.track, map);
    // Their PROMO codes (they can own several — direct sales / campaigns).
    if (data?.employee?.id) promoCodes = await employeePromoCodes(data.employee.id).catch(() => []);
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
  return <EmployeeDashboard name={s.name || "there"} data={data} error={error} commissionRole={commissionRole} isPartner={isPartner} bdName={bdName} users={users} refCode={refCode} refLink={refLink} livoBase={livo} promoCodes={promoCodes} />;
}
