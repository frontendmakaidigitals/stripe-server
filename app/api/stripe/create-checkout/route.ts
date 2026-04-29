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

    // Calculate the actual discount amount in display currency
    let resolvedDiscountAmount = 0;
    if (discountAmount && discountAmount > 0) {
      resolvedDiscountAmount = discountAmount;
    } else if (discountType === "percentage" && discountAmount) {
      // discountAmount is the percentage value (e.g. 20 for 20%)
      const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
      resolvedDiscountAmount = (subtotal * discountAmount) / 100;
    }

    // Add discount as a NEGATIVE line item — most reliable approach in Stripe
    // Works for any currency, any discount type, no coupon API needed
    if (resolvedDiscountAmount > 0 && discountCode) {
      lineItems.push({
        price_data: {
          currency: curr,
          product_data: {
            name: `Discount (${discountCode.toUpperCase()})`,
            images: [],
          },
          unit_amount: -Math.round(resolvedDiscountAmount * 100), // ← negative amount
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: customer?.email || undefined,
      line_items: lineItems,
      allow_promotion_codes: false,
      success_url: `${baseUrl}/success`,
      cancel_url: `${baseUrl}/cancel`,
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