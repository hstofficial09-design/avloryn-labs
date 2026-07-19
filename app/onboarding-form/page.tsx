import type { Metadata } from "next";
import InternForm from "./intern-form";

export const metadata: Metadata = {
  title: "Onboarding — Avloryn Labs",
  description: "Onboarding for selected Avloryn Labs team members.",
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  return (
    <main
      className="min-h-screen bg-background text-foreground [color-scheme:light]"
      // Force a light palette regardless of the visitor's OS/site dark mode, so
      // form fields never render as black-on-black. (This page is always light.)
      style={{
        "--background": "40 30% 98%",
        "--foreground": "30 8% 11%",
        "--muted-foreground": "32 7% 38%",
        "--card": "0 0% 100%",
        "--muted": "38 18% 92.5%",
      } as React.CSSProperties}
    >
      <InternForm />
    </main>
  );
}
