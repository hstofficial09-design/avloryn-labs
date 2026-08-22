import { redirect } from "next/navigation";
import { getSession } from "@/lib/portal-auth";
import { getEmployeeProfile, commissionTracksMap, trackHasCommission, partnerBdMeta } from "@/lib/portal-db";
import PortalHub from "./PortalHub";
import { roleLabel } from "@/lib/role-label";

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
  let isPartner = false, needsPayout = false;
  try {
    const prof: any = await getEmployeeProfile(s.email);
    isPartner = prof?.emp_type === "partner";
    // The onboarding profile (DOB, college, ID) belongs to staff. A network partner never filled
    // one in, so gating on it would lock them out of their own earnings on first sign-in.
    if (prof && !prof.dob && !isPartner) { needsProfile = true; }
    else {
      const map = await commissionTracksMap();
      // Partners always earn, whatever the staff track settings say.
      isCommissionRole = isPartner || trackHasCommission(prof?.track, map);
      name = prof?.name || name;
      role = roleLabel(prof);
      const meta = await partnerBdMeta(s.email).catch(() => null);
      isBd = !!meta?.isBd;
      // Nothing anywhere asks for a bank account or UPI, so the first anyone learns that a payout
      // cannot be made is when the owner tries to make it. Ask before there is money waiting.
      needsPayout = isCommissionRole
        && !String(prof?.payout_upi || "").trim()
        && !String(prof?.payout_account_no || "").trim();
    }
  } catch { /* fall back to defaults */ }
  // Missing key info (DOB) → complete profile first (redirect OUTSIDE try/catch).
  if (needsProfile) redirect("/portal/profile?complete=1");

  return (
    <main className="portal-light min-h-screen">
      <PortalHub role={role} name={name} isOwner={false} isCommissionRole={isCommissionRole} isBd={isBd} isPartner={isPartner} needsPayout={needsPayout} />
    </main>
  );
}
