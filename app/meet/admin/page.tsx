import { redirect } from "next/navigation";
import { getSession } from "@/lib/portal-auth";
import { googleConfigured } from "@/lib/booking/google";
import MeetAdmin from "./admin-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "Scheduling — Avloryn Labs", robots: { index: false, follow: false } };

export default async function MeetAdminPage() {
  // Open to the whole team — any logged-in portal user (owner or employee).
  const s = await getSession();
  if (!s) redirect("/portal/login?next=/meet/admin");
  return (
    <main className="portal-light min-h-screen">
      <MeetAdmin googleReady={googleConfigured()} />
    </main>
  );
}
