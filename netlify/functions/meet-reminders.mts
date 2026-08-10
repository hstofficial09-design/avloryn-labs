import type { Config } from "@netlify/functions";

// Fires every 15 minutes → hits the guarded reminders/follow-up endpoint.
export default async () => {
  const base = process.env.URL || "https://avloryn.com";
  const secret = process.env.CRON_SECRET || "";
  try {
    const r = await fetch(`${base}/api/meet/cron/reminders`, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    });
    const body = await r.text();
    return new Response(body, { status: r.status });
  } catch (e) {
    return new Response(`error: ${e}`, { status: 500 });
  }
};

export const config: Config = { schedule: "*/15 * * * *" };
