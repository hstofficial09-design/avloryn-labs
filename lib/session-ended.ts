/**
 * What to do when the server says you are not signed in any more.
 *
 * A portal session lasts seven days. Nothing stops you having the Scheduling page open when it
 * runs out — and at that point every request starts coming back 401 "Not authorized". The page
 * itself keeps rendering, because it loaded while you were still signed in, so what you actually
 * see is a working screen where every button silently refuses. It reads as a permissions bug or a
 * broken feature; the real answer is simply "sign in again", and nothing anywhere said so.
 *
 * So a 401 from any portal or scheduling endpoint is treated as exactly what it is — the session
 * ended — and the person is told and sent back to sign in, landing where they were.
 *
 * 403 is deliberately NOT handled here. That means "signed in, but this is not yours", which is a
 * real answer to show, not a reason to throw someone out of the app.
 */
/**
 * Does this response mean the session is gone?
 *
 * Pure so it can be proven directly — a grep for "401" in the guard is satisfied by the number
 * appearing in a comment, and a rule like that passes against code that no longer works.
 */
export function shouldSignOut(status: number, url: string): boolean {
  if (status !== 401) return false;                       // 403 = signed in, just not yours
  let pathname: string;
  try { pathname = new URL(url, "http://x").pathname; } catch { return false; }
  // Only our own endpoints — a third party's 401 says nothing about this session.
  if (!/^\/api\/(portal|meet)\//.test(pathname)) return false;
  // Signing in, out and password recovery are how a session begins and ends; a 401 from those is
  // an answer ("wrong password"), not a reason to bounce someone to the page they are already on.
  if (/^\/api\/portal\/(login|logout|forgot-password|reset-password)\b/.test(pathname)) return false;
  return true;
}

let handling = false;

export function sessionEnded(): void {
  // A screen can fire several requests at once; all of them will 401 together. Redirect once.
  if (handling || typeof window === "undefined") return;
  handling = true;
  const next = window.location.pathname + window.location.search;
  alert("Your session has ended — please sign in again.");
  window.location.href = `/portal/login?next=${encodeURIComponent(next)}`;
}

/**
 * Wrap a fetch Response. Returns it untouched unless the session is gone, in which case it
 * redirects and never resolves — so callers cannot carry on and paint an error from a dead page.
 */
export async function guard(r: Response): Promise<Response> {
  if (r.status === 401) {
    sessionEnded();
    await new Promise(() => { /* the redirect is happening; nothing should run after this */ });
  }
  return r;
}
