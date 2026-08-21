/**
 * One watchdog run: check everything, remember what changed, and shout only when shouting helps.
 *
 * Called on a schedule. It is deliberately the ONLY place that decides to send an alert, so the
 * rule "how often are we allowed to bother a human" lives in exactly one file.
 *
 * The message matters as much as the detection. "Something broke" is easy to skim past; "broken
 * since Tuesday, nobody has touched it" is not — so an alert that has been repeated says so, in
 * the subject line, where it cannot be missed.
 */
import { Resend } from "resend";
import { runAvlorynChecks, runLivodraftChecks } from "./checks";
import { reconcile, shouldAlert, markAlerted, beat, readBeats, beatChecks, type Tracked } from "./state";

/** Where an alert goes. Falls back through the addresses the site already knows about. */
function alertRecipients(): string[] {
  const raw = process.env.ALERT_TO_EMAIL || process.env.PORTAL_OWNER_EMAIL || process.env.CONTACT_TO_EMAIL || "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** "3 days", "5 hours" — how long a thing has been wrong, in words a person reads at a glance. */
function forHowLong(hours: number | null): string {
  if (hours === null) return "just now";
  if (hours < 1) return "under an hour";
  if (hours < 48) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"}`;
  return `${Math.round(hours / 24)} days`;
}

function subjectFor(items: { t: Tracked; stage: number }[]): string {
  const worst = items.reduce((a, b) => (b.stage > a.stage ? b : a));
  const first = worst.t.title;
  const more = items.length > 1 ? ` (+${items.length - 1} more)` : "";
  if (worst.stage === 0) return `Avloryn alert: ${first}${more}`;
  // The whole point of the repeat: say plainly that nothing has been done about it.
  return `STILL BROKEN after ${forHowLong(worst.t.brokenHours)} — no action taken: ${first}${more}`;
}

function bodyFor(items: { t: Tracked; stage: number }[], all: Tracked[], portalUrl: string): string {
  const row = ({ t, stage }: { t: Tracked; stage: number }) => `
    <tr><td style="padding:14px 16px;border-top:1px solid #E8E3DA;">
      <div style="font:600 14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#0D0D0D;">
        ${t.ok === null ? "Could not confirm" : "Broken"} · ${esc(t.app)} — ${esc(t.title)}
      </div>
      <div style="font:400 13px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#454545;margin-top:4px;">${esc(t.detail)}</div>
      <div style="font:500 12px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:${stage > 0 ? "#b3341f" : "#6A635A"};margin-top:6px;">
        ${stage > 0
          ? `Reported ${stage === 1 ? "yesterday" : `${stage === 2 ? "3 days" : "a week"} ago`} and still not fixed — broken for ${forHowLong(t.brokenHours)}.`
          : `First seen just now.`}
      </div>
    </td></tr>`;
  const okCount = all.filter((t) => t.ok === true).length;
  return `<div style="background:#FBF9F5;padding:28px 16px;">
    <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #E8E3DA;border-radius:14px;overflow:hidden;">
      <div style="padding:18px 16px;background:#0D0D0D;">
        <div style="font:600 15px/1.2 Georgia,serif;color:#fff;">Avloryn <span style="color:#CBB176;">Labs</span></div>
        <div style="font:500 11px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#CBB176;letter-spacing:.08em;text-transform:uppercase;margin-top:5px;">System watch</div>
      </div>
      <div style="padding:16px;font:400 13px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#454545;">
        ${items.length} thing${items.length === 1 ? "" : "s"} need${items.length === 1 ? "s" : ""} attention. ${okCount} other check${okCount === 1 ? " is" : "s are"} fine.
      </div>
      <table style="width:100%;border-collapse:collapse;">${items.map(row).join("")}</table>
      <div style="padding:18px 16px;border-top:1px solid #E8E3DA;">
        <a href="${portalUrl}/portal" style="display:inline-block;background:linear-gradient(180deg,#EAD9AC,#CDB275 55%,#AE8C4A);color:#3a2f10;text-decoration:none;font:600 13px/1 -apple-system,Segoe UI,Roboto,sans-serif;padding:11px 18px;border-radius:999px;">Open the dashboard</a>
        <div style="font:400 12px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#6A635A;margin-top:12px;">
          Mark something as being dealt with in the portal and these reminders stop for it — it stays on the dashboard until it is actually fixed.
        </div>
      </div>
    </div>
  </div>`;
}

export type RunSummary = {
  checked: number; failing: number; alerted: number;
  results: Tracked[];
  emailed: boolean;
  emailError?: string;
};

export async function runMonitor(): Promise<RunSummary> {
  // Both apps, side by side. A failure in one must not stop the other being checked.
  const [avloryn, livodraft, beats] = await Promise.all([
    runAvlorynChecks().catch((e) => [{
      id: "avloryn.selfcheck", app: "Avloryn", title: "Avloryn self-check ran", ok: false as const,
      severity: "critical" as const, detail: `the watchdog itself failed: ${e?.message || e}`.slice(0, 300),
    }]),
    runLivodraftChecks().catch((e) => [{
      id: "livodraft.reachable", app: "LivoDraft", title: "LivoDraft is reachable", ok: false as const,
      severity: "critical" as const, detail: `could not reach LivoDraft: ${e?.message || e}`.slice(0, 300),
    }]),
    readBeats().catch(() => []),
  ]);

  const results = await reconcile([...beatChecks(beats), ...avloryn, ...livodraft]);

  // Decide who gets shouted about before recording this run's own beat, so a watchdog that has
  // been dead for a week still reports itself as having been dead.
  const due = results.map((t) => ({ t, ...shouldAlert(t) })).filter((x) => x.alert);
  const failing = results.filter((t) => t.ok !== true);

  let emailed = false, emailError: string | undefined;
  if (due.length) {
    const to = alertRecipients();
    const key = process.env.RESEND_API_KEY;
    if (!key || !to.length) {
      // Worth saying out loud: the detection worked and the delivery is what is missing.
      emailError = !key ? "RESEND_API_KEY not set" : "no alert recipient configured (ALERT_TO_EMAIL)";
      console.error("[monitor] cannot send alert —", emailError);
    } else {
      try {
        const portalUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://avloryn.com").replace(/\/+$/, "");
        await new Resend(key).emails.send({
          from: process.env.CONTACT_FROM_EMAIL || "Avloryn Labs <onboarding@resend.dev>",
          to,
          subject: subjectFor(due),
          html: bodyFor(due, results, portalUrl),
          text: due.map(({ t, stage }) =>
            `${t.app} — ${t.title}\n${t.detail}\n${stage > 0 ? `Still broken after ${forHowLong(t.brokenHours)}, no action taken.` : "First seen just now."}\n`
          ).join("\n") + `\n${portalUrl}/portal`,
        });
        emailed = true;
        await markAlerted(due.map((x) => x.t.id));
      } catch (e: any) {
        emailError = e?.message || String(e);
        console.error("[monitor] alert email failed:", emailError);
      }
    }
  }

  // "I ran" — the dead-man's switch for the watchdog itself.
  await beat("monitor", `${failing.length} failing of ${results.length}`);

  return { checked: results.length, failing: failing.length, alerted: due.length, results, emailed, emailError };
}
