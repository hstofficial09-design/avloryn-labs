import { NextResponse } from "next/server";
import { getBookingByCancelToken, markBookingCancelled } from "@/lib/booking/db";
import { deleteMeetingEvent, deleteMeetingEvents, type MemberEvent } from "@/lib/booking/google";
import { deleteZohoEvents, type ZohoEvent } from "@/lib/booking/zoho";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const d = await req.json().catch(() => ({}));
  const b = await getBookingByCancelToken(String(d.token || ""));
  if (!b) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (b.status === "cancelled") return NextResponse.json({ ok: true, already: true });

  // google_event_id stores the per-member [{memberId,eventId}] list — delete each on its
  // own calendar (host first → the client gets the cancellation). Legacy single-id fallback.
  if (b.google_event_id) {
    let events: MemberEvent[] | null = null;
    try { const p = JSON.parse(b.google_event_id); if (Array.isArray(p)) events = p; } catch { /* not JSON */ }
    if (events) await deleteMeetingEvents(events);
    else for (const id of b.member_ids) await deleteMeetingEvent(id, b.google_event_id);
  }
  // Remove the mirrored Zoho events too (best-effort).
  if (b.zoho_event_id) {
    try { const z = JSON.parse(b.zoho_event_id) as ZohoEvent[]; if (Array.isArray(z)) await deleteZohoEvents(z); } catch { /* ignore */ }
  }
  await markBookingCancelled(b.id);
  return NextResponse.json({ ok: true });
}
