/**
 * Runs once when the Node server boots (Railway runs a persistent server, unlike Netlify's
 * serverless functions), and schedules everything that has to happen on a clock.
 *
 * This is the scheduler. GitHub Actions is a backup, and a poor one: measured over a week, a
 * workflow asked to run hourly went 615, 638, 533 and 800 minutes between runs — every run
 * succeeding, the workflow enabled, GitHub simply not calling it. Anything that depends on it
 * alone is silently on a thirteen-hour clock.
 *
 * Both jobs are safe to run twice, so the backup firing as well costs nothing: reminders are
 * claimed atomically before they send, and the monitor only reads.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  // Don't double-schedule across dev hot-reloads / multiple register calls.
  const g = globalThis as unknown as { __avlorynCrons?: boolean };
  if (g.__avlorynCrons) return;
  g.__avlorynCrons = true;

  const secret = process.env.CRON_SECRET || "";
  const port = process.env.PORT || "3000";
  const hit = (path: string) => async () => {
    try {
      await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { "x-cron-secret": secret } });
    } catch {
      /* best-effort — the next tick retries */
    }
  };

  const reminders = hit("/api/meet/cron/reminders");
  // First run after 2 min (let the server settle), then every 15 min.
  setTimeout(reminders, 2 * 60 * 1000);
  setInterval(reminders, 15 * 60 * 1000);

  // The watchdog. It was left on GitHub's schedule alone, so it went silent for hours at a time
  // and announced its own death — the one warning that has to be believed, crying wolf because
  // nothing was calling it. It runs here now, and GitHub stays as the backup.
  const monitor = hit("/api/cron/monitor");
  setTimeout(monitor, 3 * 60 * 1000);
  setInterval(monitor, 60 * 60 * 1000);
}
