// app/api/order/success/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const provider    = searchParams.get("provider");
  const referenceId = searchParams.get("referenceId");
  const sessionId   = searchParams.get("session_id");

  try {
    // ── Stripe ──────────────────────────────────────────────────────────────
    if (provider === "stripe" && sessionId) {
      const stripe = new (await import("stripe")).default(
        process.env.STRIPE_SECRET_KEY!,
        { apiVersion: "2026-04-22.dahlia" }
      );

      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["line_items.data.price.product"],
      });

      const aedToBase = parseFloat(session.metadata?.aedToBase || "1") || 1;

      // Build CartItem[] from Stripe line items (display currency prices)
      const items = (session.line_items?.data ?? [])
        .filter((li) => {
          const sku = (li.price?.product as any)?.metadata?.sku ?? "";
          return sku !== "__shipping__";
        })
        .map((li) => ({
          product_title: li.description ?? "Product",
          sku:           (li.price?.product as any)?.metadata?.sku        || "",
          variant_id:    (li.price?.product as any)?.metadata?.variant_id || "",
          price:         (li.price?.unit_amount ?? 0) / 100, // display currency
          quantity:      li.quantity ?? 1,
          image:         "",
        }));

      // Unpack customer from pipe-delimited metadata
      const custParts = (session.metadata?.cust || "").split("|");
      const customer = {
        name:    custParts[0] || "",
        email:   session.customer_email || custParts[1] || "",
        phone:   custParts[2] || "",
        address: custParts[3] || "",
        city:    custParts[5] || "",
        country: custParts[8] || "",
      };

      return NextResponse.json({
        orderId:        session.metadata?.order_id || sessionId,
        email:          session.customer_email,
        provider:       "stripe",
        currency:       session.currency?.toUpperCase() ?? "AED",
        items,
        shipping:       parseFloat(session.metadata?.shippingAED   || "0") / aedToBase,
        discountAmount: parseFloat(session.metadata?.discountAmountAED || "0") / aedToBase,
        discountCode:   session.metadata?.discountCode   || "",
        shippingHandle: session.metadata?.shippingHandle || "",
        customer,
      });
    }

    // ── Tabby / Tamara ───────────────────────────────────────────────────────
    if ((provider === "tabby" || provider === "tamara") && referenceId) {
      const key  = `${provider}_checkout:${referenceId}`;
      const data = await redis.get<any>(key);
      if (!data) return NextResponse.json({ error: "Order not found" }, { status: 404 });

      // Return display currency values for success page
      // Falls back to AED values if display values not stored (older sessions)
      return NextResponse.json({
        ...data,
        provider,
        items:          data.itemsDisplay    ?? data.items,
        currency:       data.currency,
        shipping:       data.shippingDisplay ?? data.shipping,
        discountAmount: data.discountDisplay ?? data.discountAmount,
        discountCode:   data.discountCode    ?? "",
        shippingHandle: data.shippingHandle  ?? "",
        email:          data.customer?.email ?? "",
      });
    }

    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  } catch (err) {
    console.error("[order/success] Error:", err);
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 });
  }
}