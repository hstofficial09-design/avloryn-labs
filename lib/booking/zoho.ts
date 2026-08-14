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
import { SITE_URL } from "@/lib/seo";

const SCOPE = "ZohoCalendar.event.ALL,ZohoCalendar.calendar.READ";

export function zohoConfigured(): boolean {
  return !!(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET);
}
const region = () => (process.env.ZOHO_REGION || "in").trim();
const accountsBase = () => `https://accounts.zoho.${region()}/oauth/v2`;
const calBase = () => `https://calendar.zoho.${region()}/api/v1`;
// Always use the canonical apex in production (Zoho/Google configs are for avloryn.com),
// so www./preview domains don't cause a redirect-URI mismatch. Localhost stays as-is for dev.
// Same trap as the Google redirect: Railway's internal origin is localhost:PORT, so anything
// that isn't a genuine dev build must use the public URL or Zoho rejects the redirect too.
const canonicalBase = (origin: string) =>
  (process.env.NODE_ENV !== "production" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(origin)
    ? origin.replace(/\/$/, "")
    : SITE_URL);
const redirectUri = (origin: string) => `${canonicalBase(origin)}/api/meet/zoho/callback`;

/** ISO → Zoho datetime "yyyyMMddTHHmmssZ" (UTC). Zoho's range + event APIs want the literal Z. */
function zdt(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
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
/** Does this member's stored Zoho grant STILL work? Same reasoning as the Google check:
 *  a saved refresh token is not evidence the grant is alive, so ask Zoho for an access token. */
export async function verifyMemberZoho(memberId: string): Promise<boolean> {
  try {
    return !!(await zohoAccess(memberId));
  } catch {
    return false;
  }
}

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
      let uid = pickEventUid(j);
      if (!uid) {
        // The event lands on the calendar even when we can't read its id out of the reply, and
        // without an id it can never be cancelled or moved again — it just sits there forever.
        // So go and find it. (This is exactly how meetings ended up stuck on Zoho calendars
        // after being cancelled: zoho_event_id was saved as NULL.)
        console.error(`[zoho] create returned no event id for member ${memberId}; reply keys: ${Object.keys(j || {}).join(",")}`);
        uid = await findEventUid(z.token, z.calUid, opts.startISO, opts.endISO, opts.summary);
      }
      if (uid) out.push({ memberId, eventUid: uid, calUid: z.calUid });
      else console.error(`[zoho] no event id for member ${memberId} — this meeting will not be removable from their Zoho calendar`);
    } catch (e) {
      console.error(`[zoho] create failed for member ${memberId}:`, e);
    }
  }
  return out;
}

/** Zoho has returned the created event under more than one shape; accept any of them. */
function pickEventUid(j: any): string | undefined {
  return j?.events?.[0]?.uid || j?.events?.[0]?.event?.uid || j?.event?.uid || j?.uid || undefined;
}

/** Last resort: list the calendar around the meeting and match the event we just wrote, so a
 *  reply we couldn't parse never costs us the ability to cancel or reschedule it. */
async function findEventUid(token: string, calUid: string, startISO: string, endISO: string, title: string): Promise<string | undefined> {
  try {
    const pad = 60_000;
    const range = JSON.stringify({
      start: zdt(new Date(Date.parse(startISO) - pad).toISOString()),
      end: zdt(new Date(Date.parse(endISO) + pad).toISOString()),
    });
    const r = await fetch(`${calBase()}/calendars/${calUid}/events?range=${encodeURIComponent(range)}`,
      { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
    const j = await r.json();
    const events: any[] = Array.isArray(j?.events) ? j.events : [];
    const want = Date.parse(startISO);
    for (const e of events) {
      if (!e?.uid || e.message) continue;
      const si = zohoDtToISO(e?.dateandtime?.start);
      // Same start instant AND same title — near-certain it is the event we just created.
      if (si && Math.abs(Date.parse(si) - want) < 60_000 && String(e.title || "").trim() === title.trim()) return e.uid;
    }
  } catch { /* fall through — nothing better we can do */ }
  return undefined;
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
      const r = await fetch(url, { method: "DELETE", headers: { Authorization: `Zoho-oauthtoken ${z.token}` } });
      if (!r.ok) console.error(`[zoho] delete failed for member ${e.memberId}: HTTP ${r.status}`);
    } catch (err) { console.error(`[zoho] delete threw for member ${e.memberId}:`, err); }
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
      const r = await fetch(url, { method: "PUT", headers: { Authorization: `Zoho-oauthtoken ${z.token}` } });
      if (!r.ok) console.error(`[zoho] reschedule failed for member ${e.memberId}: HTTP ${r.status}`);
    } catch (err) { console.error(`[zoho] reschedule threw for member ${e.memberId}:`, err); }
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

export type BusyBlock = { start: string; end: string; title?: string; allDay?: boolean };

/** All-day Zoho date "yyyyMMdd" → that day's IST midnight ISO (start) or next IST midnight (end). */
function zohoDayToISO(s: string | undefined, next = false): string | null {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, Y, Mo, D] = m;
  const d = new Date(`${Y}-${Mo}-${D}T00:00:00+05:30`);
  if (isNaN(d.getTime())) return null;
  if (next) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

/** A member's Zoho calendar events in [from,to] as busy blocks with titles (best-effort).
 *  Robust against Zoho's quirks: an empty calendar returns [{message:"No events found."}],
 *  all-day events carry a date-only "yyyyMMdd", and some events omit a title. */
export async function getZohoBusy(memberId: string, fromISO: string, toISO: string): Promise<BusyBlock[]> {
  if (!zohoConfigured()) return [];
  try {
    const z = await zohoAccess(memberId);
    if (!z) return [];
    const range = JSON.stringify({ start: zdt(fromISO), end: zdt(toISO) });
    const url = `${calBase()}/calendars/${z.calUid}/events?range=${encodeURIComponent(range)}`;
    const r = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${z.token}` } });
    const j = await r.json();
    const events: any[] = Array.isArray(j?.events) ? j.events : [];
    const out: BusyBlock[] = [];
    for (const e of events) {
      // Zoho returns [{message:"No events found."}] for an empty range — not a real event.
      if (!e || e.message || !e.dateandtime) continue;
      const title = e?.title ? String(e.title).trim().slice(0, 80) : undefined;
      const rawS = e?.dateandtime?.start, rawE = e?.dateandtime?.end;
      let si = zohoDtToISO(rawS), ei = zohoDtToISO(rawE);
      const allDay = !!e.isallday || (!si && /^\d{8}$/.test(String(rawS || "")));
      if (allDay) { si = zohoDayToISO(rawS); ei = zohoDayToISO(rawE || rawS, !rawE); }
      // Only keep blocks with two valid, ordered instants — never a NaN/half-parsed event.
      if (si && ei && !isNaN(Date.parse(si)) && !isNaN(Date.parse(ei)) && Date.parse(ei) > Date.parse(si)) {
        out.push({ start: si, end: ei, title, ...(allDay ? { allDay: true } : {}) });
      }
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
