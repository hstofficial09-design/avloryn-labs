import { NextResponse } from "next/server";
import { getSession } from "@/lib/portal-auth";
import { listTrackSettings, setTrackCommission } from "@/lib/portal-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  if (!s || s.role !== "owner") return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  return NextResponse.json({ tracks: await listTrackSettings() });
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "owner") return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const d = await req.json().catch(() => ({}));
  const track = String(d.track || "").trim();
  if (!track) return NextResponse.json({ error: "Role name required" }, { status: 400 });
  await setTrackCommission(track, d.enabled !== false);
  return NextResponse.json({ ok: true });
}
