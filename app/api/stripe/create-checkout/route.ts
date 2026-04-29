import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import type { CartItem, CustomerInfo } from "@/app/lib/checkout-token";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia",
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      items,
      currency = "aed",
      customer,
      token,
      shipping,
      shippingHandle,
      discountCode,
      discountAmount,
      discountType,
      cancelUrl
    }: {
      items: CartItem[];
      currency: string;
      customer: CustomerInfo;
      token?: string;
      shipping?: number;
      shippingHandle?: string;
      discountCode?: string;
      discountAmount?: number;
      discountType?: "percentage" | "fixed" | null;
      cancelUrl?: string;
    } = body;

    if (!items?.length) {
      return NextResponse.json({ error: "No items" }, { status: 400, headers: CORS_HEADERS });
    }

    const curr = currency.toLowerCase();
    const baseUrl = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";

    const lineItems = items.map((item) => ({
      price_data: {
        currency: curr,
        product_data: {
          name: item.product_title,
          images: item.image ? [item.image] : [],
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    }));

    if (shipping && shipping > 0) {
      lineItems.push({
        price_data: {
          currency: curr,
          product_data: { name: "Shipping", images: [] },
          unit_amount: Math.round(shipping * 100),
        },
        quantity: 1,
      });
    }

    // Build coupon using amount_off (in cents) for both percentage and fixed types.
    // discountAmount is always the pre-calculated value in display currency
    // (e.g. 20% of $478.17 = $95.63 — frontend already computed this).
    let discounts: { coupon: string }[] | undefined;
    if (discountCode && discountAmount && discountAmount > 0) {
      try {
        const amountOffCents = Math.round(discountAmount * 100);
        const coupon = await stripe.coupons.create({
          name: discountCode.toUpperCase(),
          amount_off: amountOffCents,   // always use amount_off, never percent_off
          currency: curr,
          duration: "once",
          max_redemptions: 1,
        });
        discounts = [{ coupon: coupon.id }];
        console.log(`[Stripe] Coupon created: ${coupon.id} — ${amountOffCents} cents off`);
      } catch (e) {
        console.warn("[Stripe] Could not create coupon:", e);
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: customer?.email || undefined,
      line_items: lineItems,
      ...(discounts
        ? { discounts }
        : { allow_promotion_codes: false }),
      success_url: `${baseUrl}/success`,
      cancel_url: cancelUrl ?? `${baseUrl}/checkout${token ? `?token=${token}` : ""}`,
      metadata: {
        token: token || "",
        customerName: (customer?.name || "").slice(0, 100),
        customerEmail: (customer?.email || "").slice(0, 100),
        currency,
        shippingHandle: shippingHandle || "",
        discountCode: discountCode || "",
      },
    });

    return NextResponse.json({ url: session.url }, { headers: CORS_HEADERS });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Checkout failed";
    console.error("Stripe checkout error:", message);
    return NextResponse.json({ error: message }, { status: 500, headers: CORS_HEADERS });
  }
}