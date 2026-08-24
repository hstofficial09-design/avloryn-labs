"use client";
import { useEffect } from "react";
import { sessionEnded, shouldSignOut } from "@/lib/session-ended";

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
  // A session lasts seven days, and nothing stops you having a portal page open when it runs out.
  // From that moment every request comes back 401 "Not authorized" while the page carries on
  // looking perfectly signed in — so buttons silently refuse and it reads as a broken feature or a
  // permissions bug. (This is exactly what "Add day off" did.) One interceptor here covers every
  // call from every portal screen, including ones written later, instead of each fetch remembering
  // to handle it. 403 is left alone on purpose: that means "signed in, but not yours", which is a
  // real answer worth showing rather than a reason to throw someone out.
  useEffect(() => {
    if (window.location.pathname.startsWith("/portal/login")) return;
    const original = window.fetch;
    window.fetch = async (...args) => {
      const res = await original(...args);
      try {
        const url = typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url || "";
        if (shouldSignOut(res.status, url)) sessionEnded();
      } catch { /* never let the guard break a request */ }
      return res;
    };
    return () => { window.fetch = original; };
  }, []);

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
