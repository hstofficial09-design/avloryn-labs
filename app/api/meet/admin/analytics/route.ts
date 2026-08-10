import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { canSchedule } from "@/lib/booking/admin";
import { listBookings, listMeetingTypes } from "@/lib/booking/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TZ = "Asia/Kolkata";

export async function GET() {
  if (!(await canSchedule())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const [bookings, types] = await Promise.all([listBookings({}), listMeetingTypes()]);
  const typeName = new Map(types.map((t) => [t.id, t.name]));

  const now = DateTime.now().setZone(TZ);
  const weekAgo = now.minus({ days: 7 });
  const monthAgo = now.minus({ days: 30 });

  let confirmed = 0, cancelled = 0, noShow = 0, attended = 0, thisWeek = 0, last30 = 0;
  const byType = new Map<string, number>();
  const byWeekday = Array(7).fill(0) as number[];
  const byHour = Array(24).fill(0) as number[];
  const perWeek = new Map<string, number>();

  for (const b of bookings) {
    if (b.status === "cancelled") cancelled++; else confirmed++;
    if (b.attendance === "no_show") noShow++;
    if (b.attendance === "attended") attended++;
    const dt = DateTime.fromISO(b.start_utc).setZone(TZ);
    if (!dt.isValid) continue;
    if (b.status !== "cancelled") {
      if (dt >= weekAgo && dt <= now.plus({ days: 7 })) thisWeek++;
      if (dt >= monthAgo) last30++;
      const nm = typeName.get(b.meeting_type_id || "") || "Other";
      byType.set(nm, (byType.get(nm) || 0) + 1);
      byWeekday[dt.weekday % 7]++;          // luxon weekday 1=Mon..7=Sun → %7 gives Sun=0
      byHour[dt.hour]++;
      const wk = dt.startOf("week").toISODate() || "";
      perWeek.set(wk, (perWeek.get(wk) || 0) + 1);
    }
  }

  const perWeekArr = [...perWeek.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-8).map(([week, count]) => ({ week, count }));
  const byTypeArr = [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));

  return NextResponse.json({
    total: bookings.length, confirmed, cancelled, noShow, attended, thisWeek, last30,
    byType: byTypeArr, byWeekday, byHour, perWeek: perWeekArr,
  });
}
