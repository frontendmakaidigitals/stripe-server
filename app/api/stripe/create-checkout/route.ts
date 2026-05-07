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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      items,
      currency = "aed",
      customer,
      rawToken,          // raw JWT — stored in cancelUrl only, NOT in metadata
      shipping,
      shippingHandle,
      discountCode,
      discountAmount,    // display currency — for Stripe coupon
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
          // Store SKU so the webhook can reconstruct line items accurately
          metadata: { sku: item.sku || "", variant_id: item.variant_id || "" },
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    }));

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

    // ── Coupon (display currency) ──────────────────────────────────────────
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
        console.log(`[Stripe] Coupon created: ${coupon.id} — ${Math.round(discountAmount * 100)} cents off`);
      } catch (e) {
        console.warn("[Stripe] Could not create coupon:", e);
      }
    }

    // ── Metadata: customer fields + AED monetary values ────────────────────
    // Token is intentionally NOT stored here — it exceeds Stripe's 500-char
    // metadata limit. The webhook reconstructs the order from:
    //   1. Stripe expanded line items  (products + quantities)
    //   2. customer_details on the session (name, email, address)
    //   3. These metadata fields        (phone, AED amounts)
    const safeStr = (v: string | undefined, max = 490) =>
      (v || "").slice(0, max);

    const session = await stripe.checkout.sessions.create({
      mode:                 "payment",
      payment_method_types: ["card"],
      customer_email:       customer?.email || undefined,
      line_items:           lineItems,
      ...(discounts ? { discounts } : { allow_promotion_codes: false }),
      // Collect shipping address so customer_details is populated in webhook
      shipping_address_collection: { allowed_countries: ["AE", "SA", "KW", "QA", "BH", "OM", "IN", "GB", "US"] },
      success_url: `${baseUrl}/success`,
      cancel_url:  cancelUrl ?? `${baseUrl}/checkout${rawToken ? `?token=${rawToken}` : ""}`,
      metadata: {
        // Customer fields Stripe doesn't collect (phone, address line 2)
        customerPhone:    safeStr(customer?.phone),
        customerAddress2: safeStr(customer?.address2),
        // AED monetary values for Shopify order creation
        currency:         "AED",
        aedToBase:        (aedToBase      ?? 1).toFixed(8),
        shippingAED:      (shippingAED    ?? 0).toFixed(2),
        shippingHandle:   safeStr(shippingHandle || "Shipping", 100),
        discountCode:     safeStr(discountCode   || "",          100),
        discountAmountAED:(discountAmountAED ?? 0).toFixed(2),
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