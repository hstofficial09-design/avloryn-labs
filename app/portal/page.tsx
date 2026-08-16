import { redirect } from "next/navigation";
import { getSession } from "@/lib/portal-auth";
import { getEmployeeProfile, commissionTracksMap, trackHasCommission, partnerBdMeta } from "@/lib/portal-db";
import PortalHub from "./PortalHub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "Dashboard — Avloryn Labs", robots: { index: false, follow: false } };

export default async function PortalPage() {
  const s = await getSession();
  if (!s) redirect("/portal/login");

  if (s.role === "owner") {
    return (
      <main className="portal-light min-h-screen">
        <PortalHub role="Owner" name="Hardev Singh Thakur" isOwner isCommissionRole />
      </main>
    );
  }

  let name = s.name || "there", isCommissionRole = false, role = "Employee", needsProfile = false, isBd = false;
  try {
    const prof: any = await getEmployeeProfile(s.email);
    if (prof && !prof.dob) { needsProfile = true; }
    else {
      const map = await commissionTracksMap();
      isCommissionRole = trackHasCommission(prof?.track, map);
      name = prof?.name || name;
      role = prof?.emp_type === "intern" ? `Intern${prof?.track ? " · " + prof.track : ""}` : "Employee";
      const meta = await partnerBdMeta(s.email).catch(() => null);
      isBd = !!meta?.isBd;
    }
  } catch { /* fall back to defaults */ }
  // Missing key info (DOB) → complete profile first (redirect OUTSIDE try/catch).
  if (needsProfile) redirect("/portal/profile?complete=1");

  return (
    <main className="portal-light min-h-screen">
      <PortalHub role={role} name={name} isOwner={false} isCommissionRole={isCommissionRole} isBd={isBd} />
    </main>
  );
}
