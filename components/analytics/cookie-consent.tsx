"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "avloryn-consent";

type Choice = "granted" | "denied";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function applyConsent(choice: Choice) {
  window.gtag?.("consent", "update", {
    analytics_storage: choice === "granted" ? "granted" : "denied",
  });
}

/**
 * Minimal cookie consent banner. Analytics cookies stay DENIED (Consent Mode
 * default) until the visitor clicks Accept. Choice is remembered in
 * localStorage so the banner only shows once.
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* localStorage blocked — show banner, default-denied stays in effect */
    }

    if (stored === "granted") {
      applyConsent("granted");
    } else if (stored !== "denied") {
      setVisible(true);
    }
  }, []);

  function choose(choice: Choice) {
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      /* ignore */
    }
    applyConsent(choice);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-2xl card-lux p-4 shadow-lift sm:inset-x-auto sm:right-4 sm:bottom-4 sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[0.9rem] leading-[1.6] text-muted-foreground">
          We use privacy-friendly analytics cookies to understand how the site is used.
          You can accept or decline — see our{" "}
          <a href="/privacy" className="text-gold underline underline-offset-2">
            Privacy Policy
          </a>
          .
        </p>
        <div className="flex shrink-0 items-center gap-2.5">
          <Button variant="secondary" size="md" onClick={() => choose("denied")}>
            Decline
          </Button>
          <Button variant="primary" size="md" onClick={() => choose("granted")}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
