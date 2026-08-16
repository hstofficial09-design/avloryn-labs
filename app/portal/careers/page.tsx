import { redirect } from "next/navigation";
import { getSession } from "@/lib/portal-auth";
import CareersAdmin from "./CareersAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "Careers — Avloryn Labs", robots: { index: false, follow: false } };

export default async function CareersAdminPage() {
  const s = await getSession();
  if (!s) redirect("/portal/login?next=/portal/careers");
  if (s.role !== "owner") redirect("/portal");
  return (
    <main className="portal-light min-h-screen">
      <CareersAdmin />
    </main>
  );
}
