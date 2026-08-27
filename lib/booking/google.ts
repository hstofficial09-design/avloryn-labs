/**
 * Avloryn Meetings — Google Calendar + Google Meet layer (server-only).
 * OAuth per member, free/busy reads, and event creation with an auto-generated
 * Meet link. Tokens auto-refresh and the fresh access token is persisted.
 */
import { google } from "googleapis";
import { randomUUID } from "crypto";
import { getGoogle, saveGoogle, listMembers } from "./db";
import type { Interval } from "./availability";
import { SITE_URL } from "@/lib/seo";

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function redirectUri(origin: string) {
  // MUST be the public URL. Railway runs the app on an internal localhost:PORT, so the origin
  // taken from req.url is "https://localhost:8080" in production — the old "does it look like
  // localhost?" test then treated the live server as a dev machine and sent Google an internal
  // address, so every connect attempt died with redirect_uri_mismatch. Only a real dev build
  // may use the request's own origin.
  const isDev = process.env.NODE_ENV !== "production"
    && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(origin);
  const base = isDev ? origin.replace(/\/$/, "") : SITE_URL;
  return `${base}/api/meet/google/callback`;
}

function oauthClient(origin: string) {
  const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) return null;
  return new google.auth.OAuth2(id, secret, redirectUri(origin));
}

/** URL a member visits to connect their Google account. `state` carries the member id. */
export function authUrl(memberId: string, origin: string): string | null {
  const c = oauthClient(origin);
  if (!c) return null;
  return c.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force a refresh_token every time
    scope: SCOPES,
    state: memberId,
    include_granted_scopes: true,
  });
}

/** Exchange the callback code, persist tokens against the member, return the Google email. */
export async function connectMember(memberId: string, code: string, origin: string): Promise<{ email: string | null }> {
  const c = oauthClient(origin);
  if (!c) throw new Error("Google is not configured");
  const { tokens } = await c.getToken(code);
  c.setCredentials(tokens);
  let email: string | null = null;
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: c });
    const me = await oauth2.userinfo.get();
    email = me.data.email || null;
  } catch {
    /* email is best-effort */
  }
  await saveGoogle(memberId, {
    google_email: email,
    access_token: tokens.access_token || null,
    // Google only returns a refresh_token on first consent; keep the old one if absent.
    refresh_token: tokens.refresh_token || (await getGoogle(memberId))?.refresh_token || null,
    expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    calendar_id: "primary",
    scope: tokens.scope || SCOPES.join(" "),
  });
  return { email };
}

/** An authed client for a member, auto-refreshing + persisting the access token. */
async function memberClient(memberId: string, origin = "https://avloryn.com") {
  const t = await getGoogle(memberId);
  if (!t || !t.refresh_token) return null;
  const c = oauthClient(origin);
  if (!c) return null;
  c.setCredentials({
    access_token: t.access_token || undefined,
    refresh_token: t.refresh_token,
    expiry_date: t.expiry ? new Date(t.expiry).getTime() : undefined,
  });
  // Persist any refreshed token so we don't re-refresh every call.
  c.on("tokens", (nt) => {
    saveGoogle(memberId, {
      access_token: nt.access_token || t.access_token,
      expiry: nt.expiry_date ? new Date(nt.expiry_date).toISOString() : t.expiry,
      ...(nt.refresh_token ? { refresh_token: nt.refresh_token } : {}),
    }).catch(() => {});
  });
  return { client: c, calendarId: t.calendar_id || "primary" };
}

/** Does this member's stored Google grant STILL work?
 *  A refresh token sitting in the database proves nothing — a revoked or expired grant only
 *  fails when it is used, which is why the admin list kept showing a healthy tick for a member
 *  whose calendar had already stopped accepting events. getAccessToken() returns the cached
 *  token when it is still valid and otherwise performs a real refresh, so this is cheap. */
export async function verifyMemberGoogle(memberId: string): Promise<boolean> {
  try {
    const m = await memberClient(memberId);
    if (!m) return false;
    const t = await m.client.getAccessToken();
    return !!t?.token;
  } catch {
    return false;
  }
}

/** Busy intervals for a member between two instants (empty if not connected / on error). */
export async function memberBusy(memberId: string, fromISO: string, toISO: string): Promise<Interval[]> {
  try {
    const m = await memberClient(memberId);
    if (!m) return [];
    const cal = google.calendar({ version: "v3", auth: m.client });
    const res = await cal.freebusy.query({
      requestBody: { timeMin: fromISO, timeMax: toISO, items: [{ id: m.calendarId }] },
    });
    const busy = res.data.calendars?.[m.calendarId]?.busy || [];
    return busy
      .filter((b) => b.start && b.end)
      .map((b) => ({ start: b.start as string, end: b.end as string }));
  } catch {
    // A member whose calendar can't be read simply contributes no busy times; the
    // caller can decide to treat a hard failure as "unavailable" if it prefers.
    return [];
  }
}

export type TitledBlock = { start: string; end: string; title?: string; allDay?: boolean };
/** A member's Google events in [from,to] WITH titles (events.list, not free/busy) so the
 *  Team Calendar can show the real meeting name. Best-effort; empty on error/not-connected. */
export async function memberEvents(memberId: string, fromISO: string, toISO: string): Promise<TitledBlock[]> {
  try {
    const m = await memberClient(memberId);
    if (!m) return [];
    const cal = google.calendar({ version: "v3", auth: m.client });
    const res = await cal.events.list({
      calendarId: m.calendarId,
      timeMin: fromISO,
      timeMax: toISO,
      singleEvents: true, // expand recurring into instances
      orderBy: "startTime",
      maxResults: 250,
      showDeleted: false,
    });
    const out: TitledBlock[] = [];
    for (const e of res.data.items || []) {
      if (e.status === "cancelled") continue;
      // transparent events ("free") don't block time — skip them like free/busy does.
      if (e.transparency === "transparent") continue;
      const allDay = !!e.start?.date && !e.start?.dateTime;
      const s = e.start?.dateTime || (e.start?.date ? `${e.start.date}T00:00:00+05:30` : null);
      const en = e.end?.dateTime || (e.end?.date ? `${e.end.date}T00:00:00+05:30` : null);
      if (!s || !en) continue;
      const si = new Date(s), ei = new Date(en);
      if (isNaN(si.getTime()) || isNaN(ei.getTime()) || ei <= si) continue;
      out.push({ start: si.toISOString(), end: ei.toISOString(), title: (e.summary || undefined), ...(allDay ? { allDay: true } : {}) });
    }
    return out;
  } catch {
    return [];
  }
}

export async function deleteMeetingEvent(hostMemberId: string, eventId: string): Promise<void> {
  try {
    const m = await memberClient(hostMemberId);
    if (!m) return;
    const cal = google.calendar({ version: "v3", auth: m.client });
    await cal.events.delete({ calendarId: m.calendarId, eventId, sendUpdates: "all" });
  } catch {
    /* best-effort */
  }
}

export type MemberEvent = { memberId: string; eventId: string };

/**
 * Create the meeting on EVERY attending member's OWN calendar (using each member's token)
 * so it auto-appears — no "accept the invite" step. The first connected member is the host:
 * their event carries the Meet conference + invites the client (Google emails them). The
 * other members get the same meeting written directly to their calendar with the Meet link.
 * Returns the Meet link + one {memberId,eventId} per calendar written (host first).
 */
/**
 * The order in which members are tried as host.
 *
 * The host's Google event is what creates the Meet link, so someone whose calendar lives in Zoho
 * is a poor first choice and is tried last. But a CHOSEN organizer outranks that completely.
 *
 * Exported so the rule can be proven directly: "make me the organizer" was silently losing here.
 * The choice was moved to the front, then the Zoho-last preference pushed it straight back — and
 * the owner works in Zoho, so the person who picked themselves was always the one demoted.
 */
export function hostOrder(memberIds: string[], zohoIds: Set<string>, organizerId?: string | null): string[] {
  const zohoLast = (ids: string[]) => [...ids.filter((id) => !zohoIds.has(id)), ...ids.filter((id) => zohoIds.has(id))];
  if (organizerId && memberIds.includes(organizerId)) {
    return [organizerId, ...zohoLast(memberIds.filter((id) => id !== organizerId))];
  }
  return zohoLast(memberIds);
}

export async function createMeetingForMembers(opts: {
  memberIds: string[];
  clientEmail: string;
  summary: string;
  description: string;
  startISO: string;
  endISO: string;
  /**
   * Who should get their OWN Google copy, beyond the host. Defaults to everyone.
   *
   * People who live in Zoho get their copy there instead, so writing it to Google as well is the
   * same meeting twice. The host is the exception: their Google event is what creates the Meet
   * link and invites the guest, so it always exists.
   */
  googleCopyMemberIds?: string[];
  /**
   * The team's own email addresses.
   *
   * They must be ATTENDEES on the host's event, not merely holders of a copy of it. Google admits
   * an event's attendees into its Meet straight away and makes everyone else knock — so with only
   * the guest listed, the outside guest walked in while the team stood outside asking to be let
   * into their own meeting.
   */
  memberEmails?: string[];
}): Promise<{ meetLink: string | null; events: MemberEvent[]; hostId: string | null }> {
  const events: MemberEvent[] = [];
  const start = { dateTime: opts.startISO, timeZone: "UTC" };
  const end = { dateTime: opts.endISO, timeZone: "UTC" };

  // Host = the first member whose calendar ACTUALLY accepts the event (they create the Meet
  // link and the client is invited from their calendar).
  //
  // A stored refresh token is not proof it still works — a revoked/expired grant only fails at
  // call time. Previously the first member with a token row was assumed to be the host and the
  // insert ran unguarded, so ONE stale connection threw and the whole meeting was created with
  // no calendar event and no Meet link, even when other members were connected fine. Try each
  // candidate in turn instead.
  let hostId: string | null = null;
  let meetLink: string | null = null;
  for (const id of opts.memberIds) {
    const m = await memberClient(id);
    if (!m) continue;
    try {
      const cal = google.calendar({ version: "v3", auth: m.client });
      const res = await cal.events.insert({
        calendarId: m.calendarId,
        conferenceDataVersion: 1,
        // Google emails nobody. We send our own invite, with an .ics, to the guest and to every
        // member — so anything Google sends is a second message about the same meeting.
        //
        // "externalOnly" was not enough: the team sign in with their own Gmail addresses, which are
        // external to the workspace, so Google mailed them an invitation to accept — for a meeting
        // that was already on their calendar and that they had not been asked to accept.
        sendUpdates: "none",
        requestBody: {
          summary: opts.summary,
          description: opts.description,
          start, end,
          // The team are attendees (already accepted — they are not being asked), the guest is
          // invited. Everyone on this list is admitted to the Meet without knocking.
          attendees: [
            ...(opts.memberEmails || []).filter(Boolean).map((email) => ({ email, responseStatus: "accepted" })),
            ...(opts.clientEmail ? [{ email: opts.clientEmail }] : []),
          ],
          conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
        },
      });
      meetLink =
        res.data.hangoutLink ||
        res.data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ||
        null;
      if (res.data.id) events.push({ memberId: id, eventId: res.data.id });
      hostId = id;
      break;
    } catch (e) {
      // Surface it — a member whose Google connection has gone stale needs reconnecting.
      console.error(`[meet] host calendar failed for member ${id}; trying the next member:`, e);
    }
  }
  if (!hostId) return { meetLink: null, events: [], hostId: null };

  // Every other member who uses Google gets the meeting written to their own calendar — UNLESS
  // they are already an attendee on the host's event, which now puts it there anyway.
  //
  // Doing both produced two events for one meeting: the attendee copy and this one. Being an
  // attendee is what admits them to the Meet without knocking, so that is the one to keep.
  const desc = (meetLink ? `Join Google Meet: ${meetLink}\n\n` : "") + opts.description;
  const copyTo = opts.googleCopyMemberIds ?? opts.memberIds;
  const attending = new Set((opts.memberEmails || []).map((e) => e.trim().toLowerCase()).filter(Boolean));
  // Read once rather than per member: the ids come in whatever order the host search left them,
  // so pairing them with the email list by position would quietly match the wrong people.
  const emailById = new Map((await listMembers().catch(() => [])).map((m) => [m.id, (m.email || "").trim().toLowerCase()]));
  for (const id of opts.memberIds) {
    if (id === hostId || !copyTo.includes(id)) continue;
    const mEmail = emailById.get(id) || "";
    if (mEmail && attending.has(mEmail)) continue;   // already on their calendar as an attendee
    try {
      const m = await memberClient(id);
      if (!m) continue;
      const cal = google.calendar({ version: "v3", auth: m.client });
      const res = await cal.events.insert({
        calendarId: m.calendarId,
        sendUpdates: "none",
        requestBody: { summary: opts.summary, description: desc, location: meetLink || undefined, start, end },
      });
      if (res.data.id) events.push({ memberId: id, eventId: res.data.id });
    } catch {
      /* one member's calendar failing must not block the booking */
    }
  }
  return { meetLink, events, hostId };
}

export type EventTime = {
  memberId: string; startISO: string | null; endISO: string | null; cancelled: boolean;
  /** When Google last changed this copy — decides which copy is telling the truth. */
  updatedAt: string | null;
};

/**
 * Read each per-member event's CURRENT time straight from Google, WITH the moment it was last
 * modified.
 *
 * The timestamp is the important part. Every member holds their own copy, and when one of our own
 * writes reaches one calendar but not another, the calendars disagree — a copy left on the old
 * time is not somebody moving the meeting, it is a copy we failed to update. Without knowing
 * which copy changed most recently there is no way to tell those two apart.
 */
export async function readMeetingTimes(events: MemberEvent[]): Promise<EventTime[]> {
  const out: EventTime[] = [];
  for (const ev of events) {
    try {
      const m = await memberClient(ev.memberId);
      if (!m) continue;
      const cal = google.calendar({ version: "v3", auth: m.client });
      const res = await cal.events.get({ calendarId: m.calendarId, eventId: ev.eventId });
      const s = res.data.start?.dateTime || (res.data.start?.date ? `${res.data.start.date}T00:00:00Z` : null);
      const e = res.data.end?.dateTime || (res.data.end?.date ? `${res.data.end.date}T00:00:00Z` : null);
      out.push({
        memberId: ev.memberId,
        startISO: s ? new Date(s).toISOString() : null,
        endISO: e ? new Date(e).toISOString() : null,
        cancelled: res.data.status === "cancelled",
        updatedAt: res.data.updated ? new Date(res.data.updated).toISOString() : null,
      });
    } catch (e) {
      // A deleted event 404s here. Report nothing rather than guess — we must never infer a
      // reschedule from a read that simply failed.
      console.error(`[meet] could not read event for member ${ev.memberId}:`, e);
    }
  }
  return out;
}

/** Move each per-member event to a new time (host first → notifies the client). Keeps the
 *  same Meet link. Best-effort per member. */
export async function moveMeetingEvents(events: MemberEvent[], startISO: string, endISO: string): Promise<void> {
  const start = { dateTime: startISO, timeZone: "UTC" };
  const end = { dateTime: endISO, timeZone: "UTC" };
  // The guest is an attendee on the host's event only, so exactly one patch must carry
  // sendUpdates:"all" to notify them. Sending it on index 0 regardless meant a host whose
  // connection had gone stale swallowed the notification and the guest kept the old time.
  // Send it on the first patch that actually SUCCEEDS instead.
  let notified = false;
  for (const ev of events) {
    try {
      const m = await memberClient(ev.memberId);
      if (!m) continue;
      const cal = google.calendar({ version: "v3", auth: m.client });
      await cal.events.patch({
        calendarId: m.calendarId,
        eventId: ev.eventId,
        sendUpdates: notified ? "none" : "all",
        requestBody: { start, end },
      });
      notified = true;
    } catch (e) {
      console.error(`[meet] could not move event for member ${ev.memberId}:`, e);
    }
  }
}

/** Delete each per-member event on its own calendar (host first → notifies the client). */
export async function deleteMeetingEvents(events: MemberEvent[]): Promise<void> {
  // Same reasoning as moveMeetingEvents: the cancellation notice must ride on a delete that
  // actually goes through, not on whichever event happens to be first.
  let notified = false;
  for (const ev of events) {
    try {
      const m = await memberClient(ev.memberId);
      if (!m) continue;
      const cal = google.calendar({ version: "v3", auth: m.client });
      await cal.events.delete({ calendarId: m.calendarId, eventId: ev.eventId, sendUpdates: notified ? "none" : "all" });
      notified = true;
    } catch (e) {
      console.error(`[meet] could not delete event for member ${ev.memberId}:`, e);
    }
  }
}
