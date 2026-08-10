import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getMeetingTypeBySlug, listMembers } from "@/lib/booking/db";
import BookingFlow from "./booking-flow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const mt = await getMeetingTypeBySlug(slug).catch(() => null);
  const title = mt ? `Book a ${mt.name} — Avloryn Labs` : "Book a meeting — Avloryn Labs";
  return { title, description: mt?.description || "Schedule a meeting with the Avloryn Labs team.", robots: { index: false, follow: false } };
}

export default async function MeetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const mt = await getMeetingTypeBySlug(slug).catch(() => null);
  if (!mt || !mt.active) notFound();

  const all = await listMembers(true).catch(() => []);
  const members = mt.member_ids
    .map((id) => all.find((m) => m.id === id))
    .filter(Boolean)
    .map((m) => ({ id: m!.id, name: m!.name }));

  return (
    <main className="portal-light min-h-screen">
      <BookingFlow
        mt={{
          name: mt.name,
          slug: mt.slug,
          description: mt.description || "",
          duration_min: mt.duration_min,
          mode: mt.mode,
        }}
        members={members}
      />
    </main>
  );
}
