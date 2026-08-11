import { NextResponse } from "next/server";
import { canSchedule } from "@/lib/booking/admin";
import { listMembers, membersWithGoogle, membersWithZoho } from "@/lib/booking/db";
import { memberBusy } from "@/lib/booking/google";
import { getZohoBusy } from "@/lib/booking/zoho";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Each connected member's REAL calendar events (Google + Zoho) as busy intervals,
// so the Team Calendar shows meetings created directly in Gmail/Zoho too.
export async function GET(req: Request) {
  if (!(await canSchedule())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from"), to = sp.get("to");
  if (!from || !to) return NextResponse.json({ error: "from/to required" }, { status: 400 });

  const members = await listMembers(true);
  const ids = members.map((m) => m.id);
  const [g, z] = await Promise.all([membersWithGoogle(ids), membersWithZoho(ids)]);

  const busy = await Promise.all(members.map(async (m) => {
    const parts: { start: string; end: string }[] = [];
    if (g.has(m.id)) { try { parts.push(...await memberBusy(m.id, from, to)); } catch { /* skip */ } }
    if (z.has(m.id)) { try { parts.push(...await getZohoBusy(m.id, from, to)); } catch { /* skip */ } }
    return { memberId: m.id, name: m.name, intervals: parts };
  }));

  return NextResponse.json({ busy: busy.filter((b) => b.intervals.length) });
}
