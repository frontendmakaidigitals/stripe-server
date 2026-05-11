// app/api/order/success/route.ts
import { NextRequest, NextResponse } from "next/server";
import redis from "@/app/lib/redis";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const provider    = searchParams.get("provider");
  const referenceId = searchParams.get("referenceId");
  const sessionId   = searchParams.get("session_id");

  try {
    // ── Stripe ──────────────────────────────────────────────────────────────
   if (provider === "stripe" && sessionId) {
  // Check if webhook already stored the order data
  const stored = await redis.get(`stripe_order:${sessionId}`);
  if (stored) {
    const data = JSON.parse(stored);
    return NextResponse.json({ ...data, provider: "stripe" });
  }

  // Fallback — webhook hasn't fired yet, read from Stripe directly
  const stripe = new (await import("stripe")).default(
    process.env.STRIPE_SECRET_KEY!,
    { apiVersion: "2026-04-22.dahlia" }
  );

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items.data.price.product"],
  });

  const aedToBase = parseFloat(session.metadata?.aedToBase || "1") || 1;

  const items = (session.line_items?.data ?? [])
    .filter((li) => {
      const sku = (li.price?.product as any)?.metadata?.sku ?? "";
      return sku !== "__shipping__";
    })
    .map((li) => ({
      product_title: li.description ?? "Product",
      sku:           (li.price?.product as any)?.metadata?.sku        || "",
      variant_id:    (li.price?.product as any)?.metadata?.variant_id || "",
      price:         (li.price?.unit_amount ?? 0) / 100,
      quantity:      li.quantity ?? 1,
      image:         (li.price?.product as any)?.images?.[0] || "",
    }));

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
    orderId:        sessionId, // fallback until webhook fires
    email:          session.customer_email,
    provider:       "stripe",
    currency:       session.currency?.toUpperCase() ?? "AED",
    items,
    shipping:       parseFloat(session.metadata?.shippingAED        || "0") / aedToBase,
    discountAmount: parseFloat(session.metadata?.discountAmountDisplay || "0") ||
                parseFloat(session.metadata?.discountAmountAED || "0") / aedToBase,
    discountCode:   session.metadata?.discountCode   || "",
    shippingHandle: session.metadata?.shippingHandle || "",
    customer,
  });
}

      if ((provider === "tabby" || provider === "tamara") && referenceId) {
  const displayKey = `${provider}_display:${referenceId}`;
  const raw = await redis.get(displayKey);
  if (!raw) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const data = JSON.parse(raw);

  // ← THIS LINE — read the order name stored by the webhook
  const orderId = await redis.get(`${provider}_order:${referenceId}`);

  return NextResponse.json({
    ...data,
    provider,
    orderId:        orderId ?? null,  // ← was missing
    items:          data.itemsDisplay ?? data.items,
    currency:       data.currency,
    shipping:       data.shippingDisplay ?? data.shipping,
    discountAmount: data.discountDisplay ?? data.discountAmount,
    discountCode:   data.discountCode   ?? "",
    shippingHandle: data.shippingHandle ?? "",
    email:          data.customer?.email ?? "",
  });
}


    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  } catch (err) {
    console.error("[order/success] Error:", err);
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 });
  }
}