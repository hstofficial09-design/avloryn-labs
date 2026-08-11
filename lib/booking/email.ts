/**
 * Branded (Avloryn theme) meeting-invite email — inline styles only so it renders
 * consistently across Gmail / Outlook / Apple Mail. Returns an HTML string.
 */
export function meetingInviteHTML(o: {
  heading?: string;      // e.g. "You're invited" / "New meeting"
  title: string;         // meeting title
  whenText: string;      // human date+time, e.g. "Mon, 11 Aug 2026 · 5:30 PM IST"
  withNames?: string;    // attendees
  greetingName?: string; // recipient's first name
  notes?: string;
  meetLink?: string | null;
  rescheduleUrl?: string;
  cancelUrl?: string;
}): string {
  const gold = "#c8a24a", ink = "#171512", muted = "#6b6559", cream = "#faf7f1", line = "#ece6da";
  const esc = (s: string) => String(s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] || c));
  const btn = o.meetLink
    ? `<tr><td style="padding:8px 0 4px"><a href="${esc(o.meetLink)}" style="display:inline-block;background:${gold};color:#1c1608;text-decoration:none;font-weight:600;font-size:14px;padding:12px 26px;border-radius:999px">Join with Google Meet</a></td></tr>`
    : "";
  const notes = o.notes ? `<tr><td style="padding-top:10px;color:${muted};font-size:13px;line-height:1.5"><b style="color:${ink}">Notes:</b> ${esc(o.notes)}</td></tr>` : "";
  const links = (o.rescheduleUrl || o.cancelUrl)
    ? `<tr><td style="padding-top:16px;font-size:12px;color:${muted}">${o.rescheduleUrl ? `<a href="${esc(o.rescheduleUrl)}" style="color:${gold};text-decoration:none;font-weight:600">Reschedule</a>` : ""}${o.rescheduleUrl && o.cancelUrl ? "&nbsp;·&nbsp;" : ""}${o.cancelUrl ? `<a href="${esc(o.cancelUrl)}" style="color:${gold};text-decoration:none;font-weight:600">Cancel</a>` : ""}</td></tr>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:${cream};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${cream};padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;background:#ffffff;border:1px solid ${line};border-radius:18px;overflow:hidden">
        <tr><td style="padding:22px 28px 0">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:19px;font-weight:600;color:${ink}">Avloryn <span style="color:${gold}">Labs</span></div>
          <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${muted};margin-top:4px">${esc(o.heading || "Meeting invite")}</div>
        </td></tr>
        <tr><td style="padding:16px 28px 26px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${o.greetingName ? `<tr><td style="font-size:14px;color:${ink};padding-bottom:8px">Hi ${esc(o.greetingName)},</td></tr>` : ""}
            <tr><td style="font-family:Georgia,serif;font-size:22px;font-weight:600;color:${ink};line-height:1.25;padding-bottom:10px">${esc(o.title)}</td></tr>
            <tr><td style="font-size:14px;color:${ink};padding-bottom:4px">🗓 &nbsp;<b>${esc(o.whenText)}</b></td></tr>
            ${o.withNames ? `<tr><td style="font-size:13px;color:${muted};padding-bottom:12px">With ${esc(o.withNames)}</td></tr>` : `<tr><td style="padding-bottom:8px"></td></tr>`}
            ${btn}
            ${o.meetLink ? `<tr><td style="font-size:11px;color:${muted};padding-top:6px">or open: <a href="${esc(o.meetLink)}" style="color:${gold}">${esc(o.meetLink)}</a></td></tr>` : ""}
            ${notes}
            ${links}
          </table>
        </td></tr>
        <tr><td style="padding:14px 28px;border-top:1px solid ${line};font-size:11px;color:${muted}">The attached .ics adds this to any calendar app. — Avloryn Labs</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

/** A readable "Mon, 11 Aug 2026 · 5:30 PM IST" for a start instant, in IST. */
export function whenIST(startISO: string): string {
  const d = new Date(startISO);
  if (isNaN(d.getTime())) return startISO;
  const date = d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
  return `${date} · ${time} IST`;
}
