"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

/**
 * Google Analytics 4 with Consent Mode v2.
 *
 * Loads gtag with analytics/ad storage DENIED by default — so NO analytics
 * cookies are written until the visitor accepts via the cookie banner
 * (see components/analytics/cookie-consent.tsx, which calls
 * gtag('consent','update', { analytics_storage:'granted' })).
 *
 * Renders nothing unless NEXT_PUBLIC_GA_ID is set, keeping local dev clean.
 * The Measurement ID (G-XXXXXXXXXX) is public by design.
 *
 * Skips the Sanity Studio (/studio) entirely — the owner's own CMS editing
 * must NOT pollute site analytics.
 */
export function GoogleAnalytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  const pathname = usePathname();
  if (!gaId) return null;
  // Don't load GA inside the Sanity Studio (owner's backend editing).
  if (pathname?.startsWith("/studio")) return null;

  return (
    <>
      {/* Consent defaults — must run before gtag config */}
      <Script id="ga-consent-default" strategy="beforeInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('consent', 'default', {
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            analytics_storage: 'denied'
          });
        `}
      </Script>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          gtag('js', new Date());
          gtag('config', '${gaId}', { anonymize_ip: true });
        `}
      </Script>
    </>
  );
}
