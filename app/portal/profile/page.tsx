import { redirect } from "next/navigation";
import { getSession } from "@/lib/portal-auth";
import { getEmployeeProfile, getCompanyProfile } from "@/lib/portal-db";
import ProfileForm from "./ProfileForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "My Profile — Avloryn Labs", robots: { index: false, follow: false } };

export default async function ProfilePage() {
  const s = await getSession();
  if (!s) redirect("/portal/login?next=/portal/profile");

  let profile: any = {};
  const isOwner = s.role === "owner";
  try {
    if (isOwner) profile = { full_name: "Hardev Singh Thakur", ...(await getCompanyProfile() || {}) };
    else profile = (await getEmployeeProfile(s.email)) || {};
  } catch { /* show empty form */ }

  return (
    <main className="portal-light min-h-screen">
      <ProfileForm profile={profile} isOwner={isOwner} />
    </main>
  );
}
