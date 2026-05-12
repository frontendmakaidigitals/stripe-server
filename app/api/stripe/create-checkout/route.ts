import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import type { CartItem, CustomerInfo } from "@/types/checkout.types";

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

// Clamp a string to max chars and strip pipe chars (used as delimiter)
const s = (v: string | undefined, max: number) =>
  (v || "").replace(/\|/g, " ").slice(0, max);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      items,
      currency = "aed",
      customer,
      shipping,
      shippingHandle,
      discountCode,
      discountAmount,
      cancelUrl,
      aedToBase,
      shippingAED,
      discountAmountAED,
    }: {
      items: CartItem[];
      currency: string;
      customer: CustomerInfo;
      rawToken?: string;
      shipping?: number;
      shippingHandle?: string;
      discountCode?: string;
      discountAmount?: number;
      cancelUrl?: string;
      aedToBase?: number;
      shippingAED?: number;
      discountAmountAED?: number;
    } = body;

    if (!items?.length) {
      return NextResponse.json(
        { error: "No items" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const curr    = currency.toLowerCase();
    const baseUrl = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";

    // ── Stripe line items (display currency) ───────────────────────────────
    const lineItems = items.map((item) => ({
      price_data: {
        currency: curr,
        product_data: {
          name:   item.product_title,
          images: item.image ? [item.image] : [],
          metadata: {
            sku:        item.sku        || "",
            variant_id: item.variant_id || "",
          },
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    }));

    // Shipping as a line item (display currency, filtered out in webhook)
    if (shipping && shipping > 0) {
      lineItems.push({
        price_data: {
          currency: curr,
          product_data: {
            name:     shippingHandle || "Shipping",
            images:   [],
            metadata: { sku: "__shipping__", variant_id: "" },
          },
          unit_amount: Math.round(shipping * 100),
        },
        quantity: 1,
      });
    }

    // ── Coupon (display currency, amount pre-calculated on frontend) ───────
    let discounts: { coupon: string }[] | undefined;
    if (discountCode && discountAmount && discountAmount > 0) {
      try {
        const coupon = await stripe.coupons.create({
          name:            discountCode.toUpperCase(),
          amount_off:      Math.round(discountAmount * 100),
          currency:        curr,
          duration:        "once",
          max_redemptions: 1,
        });
        discounts = [{ coupon: coupon.id }];
        console.log(
          `[Stripe] Coupon created: ${coupon.id} — ${Math.round(discountAmount * 100)} cents off`,
        );
      } catch (e) {
        console.warn("[Stripe] Could not create coupon:", e);
      }
    }

    // ── Metadata ───────────────────────────────────────────────────────────
    // Stripe limit: 500 chars per value, 50 keys.
    // Customer address is packed into one pipe-delimited string so we stay
    // well under the limit while keeping all fields the webhook needs.
    // Format: name|email|phone|address1|address2|city|province|zip|country
    const custPacked = [
      s(customer?.name,     40),
      s(customer?.email,    60),
      s(customer?.phone,    20),
      s(customer?.address,  80),
      s(customer?.address2, 40),
      s(customer?.city,     40),
      s(customer?.province, 40),
      s(customer?.zip,      20),
      s(customer?.country,  10),
    ].join("|"); // worst-case ~354 chars — safely under 500

    const session = await stripe.checkout.sessions.create({
      mode:                 "payment",
      payment_method_types: ["card"],
      customer_email:       customer?.email || undefined,
      line_items:           lineItems,
      ...(discounts ? { discounts } : { allow_promotion_codes: false }),
      success_url: `${baseUrl}/success?provider=stripe&session_id={CHECKOUT_SESSION_ID}`,

      cancel_url:  cancelUrl ?? `${baseUrl}/cancel`,
      metadata: {
        cust:              custPacked,
        aedToBase:         (aedToBase         ?? 1).toFixed(8),
        shippingAED:       (shippingAED       ?? 0).toFixed(2),
        shippingHandle:    s(shippingHandle || "Shipping", 60),
        discountCode:      s(discountCode   || "",         60),
        discountAmountAED: (discountAmountAED ?? 0).toFixed(2),
        discountAmountDisplay:  (discountAmount   ?? 0).toFixed(2), 
        shippingDisplay:       (shipping          ?? 0).toFixed(2),  // ✅ add this — shipping is already display currency


      },
    });

    return NextResponse.json({ url: session.url }, { headers: CORS_HEADERS });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Checkout failed";
    console.error("Stripe checkout error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}