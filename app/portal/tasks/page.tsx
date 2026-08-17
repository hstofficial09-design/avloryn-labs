import { redirect } from "next/navigation";
import { getSession } from "@/lib/portal-auth";
import WorkLogPage from "./WorkLogPage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "Tasks & Reviews — Avloryn Labs", robots: { index: false, follow: false } };

/**
 * One page, two views. The owner assigns work, ticks off what was delivered and scores the week;
 * everyone else keeps their own log and can take it away as a PDF. Which one you get is decided
 * from the session here, never from the URL.
 */
export default async function TasksPage() {
  const s = await getSession();
  if (!s) redirect("/portal/login?next=/portal/tasks");
  return (
    <main className="portal-light min-h-screen">
      <WorkLogPage owner={s.role === "owner"} name={s.name || (s.role === "owner" ? "Hardev Singh Thakur" : "there")} />
    </main>
  );
}
