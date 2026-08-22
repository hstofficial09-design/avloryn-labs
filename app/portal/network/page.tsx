import { redirect } from "next/navigation";
import { getSession } from "@/lib/portal-auth";
import { listPartnerBds, listPartnerNetwork, listPartnerRolesPortal, partnerBdMeta, listAttachableEmployees, listPendingPartners, partnerUsers, listAssignableParents, listAllPartnerPeople } from "@/lib/portal-db";
import NetworkDashboard from "../NetworkDashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "Partner Network — Avloryn Labs", robots: { index: false, follow: false } };

export default async function NetworkPage() {
  const s = await getSession();
  if (!s) redirect("/portal/login?next=/portal/network");

  if (s.role === "owner") {
    let bds: any[] = [], roles: string[] = [], pending: any[] = [], parents: any[] = [], people: any[] = [], error: string | null = null;
    try {
      bds = await listPartnerBds();
      roles = await listPartnerRolesPortal();
      pending = await listPendingPartners().catch(() => []);
      // Anyone the owner can hand a walk-in partner to as a reward.
      parents = await listAssignableParents().catch(() => []);
      // EVERY active person (each with their own code, direct commission, override + downline) —
      // the owner sees the whole team as pills, not only those who already have a network.
      people = await listAllPartnerPeople().catch(() => []);
    } catch (e: any) {
      error = e?.message || "Could not reach the network database.";
    }
    return <NetworkDashboard mode="owner" name={s.name || "Owner"} bds={bds} roles={roles} pending={pending} parents={parents} people={people} error={error} />;
  }

  let isBd = false, isPartner = false, myRole = "", network: any[] = [], roles: string[] = [], attachable: any[] = [], users: any[] = [], error: string | null = null;
  try {
    const meta = await partnerBdMeta(s.email);
    isBd = !!meta?.isBd;
    isPartner = !!meta?.isPartner;
    myRole = meta?.role || "";
    if (isBd && meta) {
      network = await listPartnerNetwork(meta.id);
      roles = await listPartnerRolesPortal();
      attachable = await listAttachableEmployees(meta.id).catch(() => []);
      // Buyers across the BD's whole network (all their partners' users).
      users = await partnerUsers(network.map((p: any) => p.id)).catch(() => []);
    }
  } catch (e: any) {
    error = e?.message || "Could not reach the network database.";
  }
  // The name is only ever drawn as a node in the family tree, so the fallback has to read as a
  // person there — "there" was a greeting fallback on a page that has no greeting.
  return <NetworkDashboard mode="bd" name={s.name || "You"} myRole={myRole} isBd={isBd} isPartner={isPartner} network={network} roles={roles} attachable={attachable} users={users} error={error} />;
}
