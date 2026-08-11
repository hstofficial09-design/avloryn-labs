import { NextResponse } from "next/server";
import { canSchedule } from "@/lib/booking/admin";
import { listMembers, membersWithGoogle, membersWithZoho } from "@/lib/booking/db";
import { memberEvents } from "@/lib/booking/google";
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

  type Blk = { start: string; end: string; title?: string; allDay?: boolean };
  const busy = await Promise.all(members.map(async (m) => {
    const parts: Blk[] = [];
    // Google via events.list (carries titles), Zoho via its events API — both titled + robust.
    if (g.has(m.id)) { try { parts.push(...await memberEvents(m.id, from, to)); } catch { /* skip */ } }
    if (z.has(m.id)) { try { parts.push(...await getZohoBusy(m.id, from, to)); } catch { /* skip */ } }
    // Drop anything unparseable, then de-dup an event that appears on BOTH calendars
    // (overlap by >50%) keeping the titled copy so nothing double-renders.
    const valid = parts.filter((p) => {
      const s = Date.parse(p.start), e = Date.parse(p.end);
      return !isNaN(s) && !isNaN(e) && e > s;
    });
    const kept: Blk[] = [];
    for (const p of valid.sort((a, b) => Date.parse(a.start) - Date.parse(b.start))) {
      const ps = Date.parse(p.start), pe = Date.parse(p.end);
      const dup = kept.find((k) => {
        const ks = Date.parse(k.start), ke = Date.parse(k.end);
        const ov = Math.min(pe, ke) - Math.max(ps, ks);
        return ov > 0 && ov >= 0.5 * Math.min(pe - ps, ke - ks);
      });
      if (!dup) kept.push(p);
      else if (!dup.title && p.title) dup.title = p.title; // upgrade to the titled copy
    }
    return { memberId: m.id, name: m.name, intervals: kept };
  }));

  return NextResponse.json({ busy: busy.filter((b) => b.intervals.length) });
}
