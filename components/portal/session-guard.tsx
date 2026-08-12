"use client";
import { useEffect } from "react";

// Auto sign-out for the Partner Portal.
//  • Not "remember me": sign out after 30 min of inactivity, and re-validate on a
//    back/forward-cache restore (browser Back) so a stale signed-in page can't linger.
//  • "Remember me": stays signed in — no idle/back logout.
// The client can't read the httpOnly session cookie, so login also drops a readable
// `portal_remember` flag (1 = remembered, 0 = not) that this guard reads.
const IDLE_MS = 30 * 60 * 1000; // 30 minutes

function cookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(name + "="));
  return hit ? decodeURIComponent(hit.split("=").slice(1).join("=")) : null;
}

export default function SessionGuard() {
  useEffect(() => {
    // Never guard the login page itself.
    if (window.location.pathname.startsWith("/portal/login")) return;
    const remember = cookie("portal_remember");
    if (remember === "1" || remember === null) return; // remembered, or no portal session

    let timer: number | undefined;
    async function signOut() {
      try { await fetch("/api/portal/logout", { method: "POST" }); } catch { /* ignore */ }
      window.location.href = "/portal/login";
    }
    const reset = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(signOut, IDLE_MS);
    };
    const acts = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;
    acts.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    // Browser Back restoring a cached page → reload so the server re-checks the session.
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) window.location.reload(); };
    window.addEventListener("pageshow", onShow);

    return () => {
      if (timer) window.clearTimeout(timer);
      acts.forEach((e) => window.removeEventListener(e, reset));
      window.removeEventListener("pageshow", onShow);
    };
  }, []);
  return null;
}
