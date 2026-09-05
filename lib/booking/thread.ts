/**
 * One meeting, one conversation.
 *
 * A single booking sends up to five emails — request received, confirmed, a reminder or two, a
 * follow-up, and a reschedule or cancellation if either happens. Each carried its own subject
 * ("Confirmed: …", "Reminder: … in 1 day", "Thanks for meeting…"), so every mail client filed them
 * as separate conversations: one meeting, five lines in the inbox, none of which go away when the
 * meeting is over.
 *
 * Mail cannot be deleted from somebody else's mailbox — there is no recall in email — so the thing
 * to fix is the clutter itself. Two rules do it, and both are needed:
 *
 *   The SUBJECT stays identical for the life of a booking. Zoho Mail groups a conversation largely
 *   by subject, so a subject that changes with each message defeats it however good the headers
 *   are. That is why the state ("Reminder", "Rescheduled", "Cancelled") lives in the body, where
 *   every one of these emails already carries a heading saying exactly that.
 *
 *   Every message REFERENCES a common root. Gmail and Outlook thread on In-Reply-To/References
 *   rather than on the subject line. The root id is derived from the booking, so no message has to
 *   be stored or looked up, and the fifth email threads with the first months later.
 *
 * Deliberately no date in the subject: a reschedule would change it, and the thread would split at
 * exactly the moment somebody needs to see the old and new times together.
 */
const ROOT_DOMAIN = "meet.avloryn.com";

/** The headers that tie every email about one booking together. */
export function threadHeaders(bookingId?: string | null): Record<string, string> {
  const id = String(bookingId || "").trim();
  if (!id) return {};
  const root = `<meeting-${id}@${ROOT_DOMAIN}>`;
  return { "In-Reply-To": root, References: root };
}

/** What the guest sees, from the first email to the last. */
export const guestSubject = (title: string) => `${String(title || "Meeting").trim()} with Avloryn Labs`;

/** What the team sees. Named by client so two bookings do not read alike in a busy inbox. */
export const teamSubject = (title: string, clientName?: string | null) => {
  const t = String(title || "Meeting").trim();
  const c = String(clientName || "").trim();
  return c ? `${t} — ${c}` : t;
};
