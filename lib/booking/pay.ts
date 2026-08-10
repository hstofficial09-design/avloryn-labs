/**
 * Avloryn Meetings — payments (Razorpay) + coupon quoting. Server-only.
 * Needs RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET. If unset, paid meeting types simply
 * can't be paid (the booking route rejects), but free bookings are unaffected.
 */
import crypto from "crypto";
import { getCoupon } from "./db";

export function razorpayConfigured(): boolean {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}
export function razorpayKeyId(): string | null {
  return process.env.RAZORPAY_KEY_ID || null;
}

/** Apply a coupon to a base price (INR). Returns the final amount + whether the coupon was valid. */
export async function quote(priceInr: number, couponCode?: string): Promise<{ amount: number; discount: number; couponValid: boolean; couponCode: string | null }> {
  const base = Math.max(0, Math.round(priceInr || 0));
  const code = (couponCode || "").toUpperCase().trim();
  if (!code) return { amount: base, discount: 0, couponValid: false, couponCode: null };
  const c = await getCoupon(code);
  const usable = !!c && c.active && (c.max_uses === 0 || c.uses < c.max_uses);
  if (!usable) return { amount: base, discount: 0, couponValid: false, couponCode: null };
  const discount = c!.kind === "percent" ? Math.round((base * c!.value) / 100) : Math.round(c!.value);
  const amount = Math.max(0, base - discount);
  return { amount, discount: base - amount, couponValid: true, couponCode: code };
}

/** Create a Razorpay order for an INR amount. Returns null if not configured. */
export async function createOrder(amountInr: number): Promise<{ orderId: string; amount: number; currency: string } | null> {
  if (!razorpayConfigured()) return null;
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const r = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: Math.round(amountInr * 100), currency: "INR", payment_capture: 1 }),
  });
  const j = await r.json();
  if (!r.ok || !j.id) throw new Error(j?.error?.description || "Could not create payment order");
  return { orderId: j.id, amount: j.amount, currency: j.currency };
}

/** Verify a Razorpay payment signature (proves the payment is genuine for that order). */
export function verifySignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  try {
    return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
