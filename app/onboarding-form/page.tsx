import type { Metadata } from "next";
import InternForm from "./intern-form";

export const metadata: Metadata = {
  title: "Intern Onboarding — Avloryn Labs",
  description: "Onboarding for selected Avloryn Labs interns.",
  robots: { index: false, follow: false },
};

export default function InternOnboardingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <InternForm />
    </main>
  );
}
