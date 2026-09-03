import { redirect } from "next/navigation";
import { getSession } from "@/lib/portal-auth";
import { getEmployeeProfile, commissionTracksMap, trackHasCommission, partnerBdMeta, listTeamBirthdays } from "@/lib/portal-db";
import { upcomingBirthdays, dobMonthDay } from "@/lib/birthdays";
import type { BirthdayRow } from "./Birthdays";
import PortalHub from "./PortalHub";
import { roleLabel } from "@/lib/role-label";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "Dashboard — Avloryn Labs", robots: { index: false, follow: false } };

/** The board's rows, computed on the server so "today" is India's today, not the server's.
 *  Any failure yields an empty board rather than an error page — nobody should lose their
 *  dashboard because a birthday could not be read. */
async function birthdayRows(): Promise<{ rows: BirthdayRow[]; missing: number }> {
  try {
    // One retry. The first request after a deploy can arrive before the connection pool is warm,
    // and the board was simply absent from that page — the portal itself rendered fine, which is
    // the point of the catch below, but a colleague opening it at that moment saw nothing.
    let people;
    try { people = await listTeamBirthdays(); }
    catch { await new Promise((r) => setTimeout(r, 300)); people = await listTeamBirthdays(); }
    const rows = upcomingBirthdays(people, undefined, 5)
      .map(({ name, days, label, date, kind }) => ({ name, days, label, date, kind }));
    // A count, never the names — the owner needs to know there is something to chase, and nobody
    // else needs to know whose record is incomplete.
    const missing = people.filter((p) => !dobMonthDay(p.dob)).length;
    return { rows, missing };
  } catch { return { rows: [], missing: 0 }; }
}

export default async function PortalPage() {
  const s = await getSession();
  if (!s) redirect("/portal/login");

  if (s.role === "owner") {
    const b = await birthdayRows();
    return (
      <main className="portal-light min-h-screen">
        <PortalHub role="Owner" name="Hardev Singh Thakur" isOwner isCommissionRole
                   birthdays={b.rows} birthdaysMissing={b.missing} />
      </main>
    );
  }

  let name = s.name || "there", isCommissionRole = false, role = "Employee", needsProfile = false, isBd = false;
  let isPartner = false, needsPayout = false;
  // Neither depends on the other, and the database is a fifth of a second away each time.
  const [birthdays, prof]: [{ rows: BirthdayRow[]; missing: number }, any] = await Promise.all([
    birthdayRows(),
    getEmployeeProfile(s.email).catch(() => null),
  ]);
  try {
    isPartner = prof?.emp_type === "partner";
    // The onboarding profile (DOB, college, ID) belongs to staff. A network partner never filled
    // one in, so gating on it would lock them out of their own earnings on first sign-in.
    if (prof && !prof.dob && !isPartner) { needsProfile = true; }
    else {
      // These two do not depend on each other; one after the other was two round trips to a
      // database that is a fifth of a second away.
      const [map, meta] = await Promise.all([
        commissionTracksMap(),
        partnerBdMeta(s.email).catch(() => null),
      ]);
      // Partners always earn, whatever the staff track settings say.
      isCommissionRole = isPartner || trackHasCommission(prof?.track, map);
      name = prof?.name || name;
      role = roleLabel(prof);
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
      <PortalHub role={role} name={name} isOwner={false} isCommissionRole={isCommissionRole} isBd={isBd} isPartner={isPartner} needsPayout={needsPayout} birthdays={birthdays.rows} />
    </main>
  );
}
