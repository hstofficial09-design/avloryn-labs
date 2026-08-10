import { NextResponse } from "next/server";
import { getMeetingTypeBySlug } from "@/lib/booking/db";
import { quote, createOrder, razorpayConfigured, razorpayKeyId } from "@/lib/booking/pay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Creates a Razorpay order for a paid meeting type (amount computed server-side).
export async function POST(req: Request) {
  const d = await req.json().catch(() => ({}));
  const mt = await getMeetingTypeBySlug(String(d.slug || ""));
  if (!mt || !mt.active) return NextResponse.json({ error: "Unknown meeting type" }, { status: 404 });
  if (!mt.price_inr || mt.price_inr <= 0) return NextResponse.json({ error: "This meeting is free" }, { status: 400 });
  if (!razorpayConfigured()) return NextResponse.json({ error: "Payments are not configured" }, { status: 503 });

  const q = await quote(mt.price_inr, d.coupon);
  if (q.amount <= 0) {
    // Fully discounted → no payment needed; the booking route accepts a zero-amount coupon.
    return NextResponse.json({ free: true, amount: 0, discount: q.discount, couponValid: q.couponValid, couponCode: q.couponCode });
  }
  try {
    const order = await createOrder(q.amount);
    if (!order) return NextResponse.json({ error: "Payments are not configured" }, { status: 503 });
    return NextResponse.json({
      orderId: order.orderId, amount: order.amount, currency: order.currency,
      keyId: razorpayKeyId(), discount: q.discount, couponValid: q.couponValid, couponCode: q.couponCode,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Payment error" }, { status: 500 });
  }
}
