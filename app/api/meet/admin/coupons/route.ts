import { NextResponse } from "next/server";
import { canSchedule } from "@/lib/booking/admin";
import { listCoupons, createCoupon, deleteCoupon } from "@/lib/booking/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const deny = () => NextResponse.json({ error: "Not authorized" }, { status: 401 });

export async function GET() {
  if (!(await canSchedule())) return deny();
  return NextResponse.json({ coupons: await listCoupons() });
}

export async function POST(req: Request) {
  if (!(await canSchedule())) return deny();
  const d = await req.json().catch(() => ({}));
  const code = String(d.code || "").toUpperCase().trim();
  if (!/^[A-Z0-9]{3,24}$/.test(code)) return NextResponse.json({ error: "Code must be 3–24 letters/numbers" }, { status: 400 });
  const kind = d.kind === "flat" ? "flat" : "percent";
  const value = Math.max(1, Math.round(Number(d.value) || 0));
  if (kind === "percent" && value > 100) return NextResponse.json({ error: "Percent can't exceed 100" }, { status: 400 });
  await createCoupon({ code, kind, value, max_uses: Math.max(0, Math.round(Number(d.max_uses) || 0)) });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await canSchedule())) return deny();
  const code = new URL(req.url).searchParams.get("code") || "";
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
  await deleteCoupon(code);
  return NextResponse.json({ ok: true });
}
