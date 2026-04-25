// app/api/stripe/create-checkout/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Creates a Stripe checkout session.
// Stores customer + cart items in session metadata so the webhook
// can create the Shopify order after payment succeeds.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import type { CartItem, CustomerInfo } from "@/app/lib/checkout-token";
 
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia",
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
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
    }: { items: CartItem[]; currency: string; customer: CustomerInfo } = body;

    if (!items?.length) {
      return NextResponse.json({ error: "No items" }, { status: 400, headers: CORS_HEADERS });
    }

    const baseUrl = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode:                 "payment",
      payment_method_types: ["card"],
      customer_email:       customer?.email || undefined,
      line_items: items.map((item) => ({
        price_data: {
          currency:     currency.toLowerCase(),
          product_data: {
            name:   item.product_title,
            images: item.image ? [item.image] : [],
          },
          unit_amount: item.price, // already in cents
        },
        quantity: item.quantity,
      })),
      allow_promotion_codes: true,
      success_url:           `${baseUrl}/success`,
      cancel_url:            `${baseUrl}/cancel`,

      // ── Store everything the webhook needs to create the Shopify order ──
      // Stripe metadata values must be strings and total < 8KB
      metadata: {
        customer: JSON.stringify(customer || {}),
        items:    JSON.stringify(items),
        currency,
      },
    });

    return NextResponse.json({ url: session.url }, { headers: CORS_HEADERS });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Checkout failed";
    console.error("Stripe checkout error:", message);
    return NextResponse.json({ error: message }, { status: 500, headers: CORS_HEADERS });
  }
}