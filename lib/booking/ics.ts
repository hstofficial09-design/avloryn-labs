// Build a standard iCalendar (.ics) invite so ANY attendee — Google, Outlook, Apple,
// Zoho, Proton, anything — can add the meeting to their own calendar from the email.
// This is provider-independent: we never touch the attendee's calendar directly.

function esc(s: string): string {
  return (s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// ISO → iCalendar UTC basic form: 20260812T093000Z
function toICS(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Fold long lines to 75 octets per RFC 5545 (continuation lines start with a space).
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) { parts.push(" " + rest.slice(0, 74)); rest = rest.slice(74); }
  parts.push(" " + rest);
  return parts.join("\r\n");
}

export function buildICS(o: {
  uid: string;
  startISO: string;
  endISO: string;
  summary: string;
  description?: string;
  location?: string;
  organizerName?: string;
  organizerEmail?: string;
  attendeeEmails?: string[];
  method?: "REQUEST" | "CANCEL";
  status?: "CONFIRMED" | "CANCELLED";
  /** Revision number. Calendar clients IGNORE an update whose SEQUENCE is not higher than the
   *  copy they already hold, so every reschedule/cancellation must send a bigger one than the
   *  original invite — use icsSequence(). */
  sequence?: number;
}): string {
  const method = o.method || "REQUEST";
  const status = o.status || "CONFIRMED";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Avloryn Labs//Scheduling//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${o.uid}@avloryn.com`,
    `DTSTAMP:${toICS(new Date().toISOString())}`,
    `DTSTART:${toICS(o.startISO)}`,
    `DTEND:${toICS(o.endISO)}`,
    `SUMMARY:${esc(o.summary)}`,
  ];
  if (o.description) lines.push(`DESCRIPTION:${esc(o.description)}`);
  if (o.location) lines.push(`LOCATION:${esc(o.location)}`);
  if (o.organizerEmail) lines.push(`ORGANIZER;CN=${esc(o.organizerName || "Avloryn Labs")}:mailto:${o.organizerEmail}`);
  for (const a of o.attendeeEmails || []) {
    if (a) lines.push(`ATTENDEE;RSVP=TRUE:mailto:${a}`);
  }
  lines.push(`STATUS:${status}`, `SEQUENCE:${Math.max(0, Math.floor(o.sequence ?? 0))}`, "END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n");
}

/** A revision number that always rises: seconds since 2026-01-01. Any later update therefore
 *  outranks whatever the attendee's calendar is already holding, without us storing a counter. */
export function icsSequence(): number {
  return Math.max(1, Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 1000));
}
