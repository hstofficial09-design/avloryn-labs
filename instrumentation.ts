/**
 * Runs once when the Node server boots (Railway runs a persistent server, unlike
 * Netlify's serverless functions). Fires the meeting reminders / follow-up cron every
 * 15 minutes — the replacement for the Netlify scheduled function.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  // Don't double-schedule across dev hot-reloads / multiple register calls.
  const g = globalThis as unknown as { __avlorynReminderCron?: boolean };
  if (g.__avlorynReminderCron) return;
  g.__avlorynReminderCron = true;

  const secret = process.env.CRON_SECRET || "";
  const port = process.env.PORT || "3000";
  const tick = async () => {
    try {
      await fetch(`http://127.0.0.1:${port}/api/meet/cron/reminders`, {
        method: "POST",
        headers: { "x-cron-secret": secret },
      });
    } catch {
      /* best-effort — the next tick retries */
    }
  };
  // First run after 2 min (let the server settle), then every 15 min.
  setTimeout(tick, 2 * 60 * 1000);
  setInterval(tick, 15 * 60 * 1000);
}
