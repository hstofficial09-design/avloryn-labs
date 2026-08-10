import { redirect } from "next/navigation";
import { getSession } from "@/lib/portal-auth";
import OnboardingBuilder from "./OnboardingBuilder";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "Onboarding Form — Avloryn Labs", robots: { index: false, follow: false } };

export default async function OnboardingPage() {
  const s = await getSession();
  if (!s) redirect("/portal/login?next=/portal/onboarding");
  if (s.role !== "owner") redirect("/portal");
  return (
    <main className="portal-light min-h-screen">
      <OnboardingBuilder />
    </main>
  );
}
