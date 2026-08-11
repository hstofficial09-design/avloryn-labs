/**
 * Avloryn Meetings — Zoho Calendar layer (server-only, OPTIONAL).
 * Mirrors a booking onto a member's Zoho Calendar. Everything is best-effort and
 * fail-open: if Zoho is not configured / a call fails, Google + the booking are unaffected.
 *
 * Setup: create a "Server-based" client at api-console.zoho.in →
 *   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REGION (in|com|eu|com.au ; default "in").
 * Redirect URI: {origin}/api/meet/zoho/callback
 */
import { getZoho, saveZoho, listMembers } from "./db";
import type { Interval } from "./availability";

const SCOPE = "ZohoCalendar.event.ALL,ZohoCalendar.calendar.READ";

export function zohoConfigured(): boolean {
  return !!(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET);
}
const region = () => (process.env.ZOHO_REGION || "in").trim();
const accountsBase = () => `https://accounts.zoho.${region()}/oauth/v2`;
const calBase = () => `https://calendar.zoho.${region()}/api/v1`;
const redirectUri = (origin: string) => `${origin.replace(/\/$/, "")}/api/meet/zoho/callback`;

/** ISO → Zoho datetime "yyyyMMddTHHmmss+0000" (Zoho wants an explicit offset, not "Z"). */
function zdt(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "+0000");
}

export function zohoAuthUrl(memberId: string, origin: string): string | null {
  const id = process.env.ZOHO_CLIENT_ID;
  if (!id) return null;
  const p = new URLSearchParams({
    scope: SCOPE, client_id: id, response_type: "code", access_type: "offline",
    prompt: "consent", redirect_uri: redirectUri(origin), state: memberId,
  });
  return `${accountsBase()}/auth?${p.toString()}`;
}

async function tokenRequest(body: Record<string, string>): Promise<any> {
  const r = await fetch(`${accountsBase()}/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  return r.json();
}

export async function connectZohoMember(memberId: string, code: string, origin: string): Promise<{ email: string | null }> {
  if (!zohoConfigured()) throw new Error("Zoho not configured");
  const tok = await tokenRequest({
    grant_type: "authorization_code", client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!, redirect_uri: redirectUri(origin), code,
  });
  if (!tok.access_token) throw new Error(tok.error || "Zoho token exchange failed");
  const apiDomain: string | null = tok.api_domain || null;
  const expiry = tok.expires_in ? new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString() : null;

  // Find the default calendar uid + the account email.
  let calendarUid: string | null = null, email: string | null = null;
  try {
    const r = await fetch(`${calBase()}/calendars`, { headers: { Authorization: `Zoho-oauthtoken ${tok.access_token}` } });
    const j = await r.json();
    const cals: any[] = j?.calendars || j?.data || [];
    const def = cals.find((c) => c.isdefault || c.default || c.is_default) || cals[0];
    calendarUid = def?.uid || def?.caluid || def?.id || null;
    email = def?.email || def?.author_email || null;
  } catch { /* best-effort */ }

  await saveZoho(memberId, {
    zoho_email: email, access_token: tok.access_token,
    refresh_token: tok.refresh_token || (await getZoho(memberId))?.refresh_token || null,
    expiry, api_domain: apiDomain, calendar_uid: calendarUid, scope: SCOPE,
  });
  return { email };
}

/** A usable access token for a member, refreshing if expired. */
async function zohoAccess(memberId: string): Promise<{ token: string; calUid: string } | null> {
  const t = await getZoho(memberId);
  if (!t || !t.refresh_token || !t.calendar_uid) return null;
  let access = t.access_token;
  const expired = !t.expiry || new Date(t.expiry).getTime() < Date.now();
  if (expired) {
    try {
      const tok = await tokenRequest({
        grant_type: "refresh_token", client_id: process.env.ZOHO_CLIENT_ID!,
        client_secret: process.env.ZOHO_CLIENT_SECRET!, refresh_token: t.refresh_token,
      });
      if (tok.access_token) {
        access = tok.access_token;
        await saveZoho(memberId, { access_token: access, expiry: tok.expires_in ? new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString() : null });
      }
    } catch { return null; }
  }
  if (!access) return null;
  return { token: access, calUid: t.calendar_uid };
}

export type ZohoEvent = { memberId: string; eventUid: string; calUid: string };

/** Mirror the meeting onto each connected member's Zoho Calendar. Best-effort. */
export async function createZohoForMembers(opts: {
  memberIds: string[]; summary: string; description: string; startISO: string; endISO: string; meetLink: string | null;
}): Promise<ZohoEvent[]> {
  if (!zohoConfigured()) return [];
  const out: ZohoEvent[] = [];
  const eventdata = {
    title: opts.summary,
    description: (opts.meetLink ? `Join Google Meet: ${opts.meetLink}\n\n` : "") + opts.description,
    location: opts.meetLink || "Online",
    dateandtime: { timezone: "UTC", start: zdt(opts.startISO), end: zdt(opts.endISO) },
  };
  for (const memberId of opts.memberIds) {
    try {
      const z = await zohoAccess(memberId);
      if (!z) continue;
      const url = `${calBase()}/calendars/${z.calUid}/events?eventdata=${encodeURIComponent(JSON.stringify(eventdata))}`;
      const r = await fetch(url, { method: "POST", headers: { Authorization: `Zoho-oauthtoken ${z.token}` } });
      const j = await r.json();
      const uid = j?.events?.[0]?.uid;
      if (uid) out.push({ memberId, eventUid: uid, calUid: z.calUid });
    } catch { /* one member failing never blocks */ }
  }
  return out;
}

async function eventEtag(token: string, calUid: string, eventUid: string): Promise<string | null> {
  try {
    const r = await fetch(`${calBase()}/calendars/${calUid}/events/${eventUid}`, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
    const j = await r.json();
    return j?.events?.[0]?.etag || null;
  } catch { return null; }
}

export async function deleteZohoEvents(events: ZohoEvent[]): Promise<void> {
  if (!zohoConfigured()) return;
  for (const e of events) {
    try {
      const z = await zohoAccess(e.memberId);
      if (!z) continue;
      const etag = await eventEtag(z.token, e.calUid, e.eventUid);
      const url = `${calBase()}/calendars/${e.calUid}/events/${e.eventUid}${etag ? `?etag=${encodeURIComponent(etag)}` : ""}`;
      await fetch(url, { method: "DELETE", headers: { Authorization: `Zoho-oauthtoken ${z.token}` } });
    } catch { /* best-effort */ }
  }
}

export async function moveZohoEvents(events: ZohoEvent[], startISO: string, endISO: string): Promise<void> {
  if (!zohoConfigured()) return;
  const eventdata = { dateandtime: { timezone: "UTC", start: zdt(startISO), end: zdt(endISO) } };
  for (const e of events) {
    try {
      const z = await zohoAccess(e.memberId);
      if (!z) continue;
      const etag = await eventEtag(z.token, e.calUid, e.eventUid);
      const url = `${calBase()}/calendars/${e.calUid}/events/${e.eventUid}?eventdata=${encodeURIComponent(JSON.stringify(eventdata))}${etag ? `&etag=${encodeURIComponent(etag)}` : ""}`;
      await fetch(url, { method: "PUT", headers: { Authorization: `Zoho-oauthtoken ${z.token}` } });
    } catch { /* best-effort */ }
  }
}

/** Zoho datetime "yyyyMMddTHHmmss±hhmm" (or Z) → ISO. */
function zohoDtToISO(s?: string): string | null {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z|[+-]\d{4})?$/);
  if (!m) return null;
  const [, Y, Mo, D, H, Mi, S, tz] = m;
  const off = !tz || tz === "Z" ? "Z" : `${tz.slice(0, 3)}:${tz.slice(3)}`;
  const d = new Date(`${Y}-${Mo}-${D}T${H}:${Mi}:${S}${off}`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** A member's Zoho calendar events in [from,to] as busy intervals (best-effort). */
export async function getZohoBusy(memberId: string, fromISO: string, toISO: string): Promise<Interval[]> {
  if (!zohoConfigured()) return [];
  try {
    const z = await zohoAccess(memberId);
    if (!z) return [];
    const range = JSON.stringify({ start: zdt(fromISO), end: zdt(toISO) });
    const url = `${calBase()}/calendars/${z.calUid}/events?range=${encodeURIComponent(range)}`;
    const r = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${z.token}` } });
    const j = await r.json();
    const events: any[] = j?.events || [];
    const out: Interval[] = [];
    for (const e of events) {
      const si = zohoDtToISO(e?.dateandtime?.start), ei = zohoDtToISO(e?.dateandtime?.end);
      if (si && ei) out.push({ start: si, end: ei });
    }
    return out;
  } catch { return []; }
}

/** For admin display: which of these members have Zoho linked. */
export async function zohoLinkedEmails(memberIds: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  await Promise.all(memberIds.map(async (id) => { const z = await getZoho(id); if (z) out[id] = z.zoho_email; }));
  return out;
}
export { listMembers };
