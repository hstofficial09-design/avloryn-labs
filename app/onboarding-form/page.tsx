import type { Metadata } from "next";
import InternForm from "./intern-form";

export const metadata: Metadata = {
  title: "Onboarding — Avloryn Labs",
  description: "Onboarding for selected Avloryn Labs team members.",
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  return (
    <main className="portal-light min-h-screen">
      <InternForm />
    </main>
  );
}
