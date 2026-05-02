import { NextRequest, NextResponse } from "next/server";
import type { CartItem, CustomerInfo } from "@/types/checkout.types";
import { verifyCheckoutToken } from "@/app/lib/checkout-token";
import { markTokenUsed } from "@/app/lib/used-tokens";

export const runtime = "nodejs";

function verifyTabbySignature(request: NextRequest): boolean {
  const incoming = request.headers.get("x-webhook-signature")
    ?? request.headers.get("x-tabby-signature");

  const secrets = [
    process.env.TABBY_WEBHOOK_SECRET_AED,
    process.env.TABBY_WEBHOOK_SECRET_KWD,
    process.env.TABBY_WEBHOOK_SECRET_SAR,
  ].filter(Boolean);

  if (!secrets.length) {
    console.warn("[Tabby webhook] No webhook secrets set — skipping verification");
    return true;
  }

  return secrets.some((s) => s === incoming);
}
// ── Shopify order creation ─────────────────────────────────────────────────────
async function createShopifyOrder(
  items: CartItem[],
  customer: CustomerInfo,
  currency: string,
  tabbyPaymentId: string,
  shipping: number = 0,
  discountAmount: number = 0,
  discountCode?: string,
): Promise<string> {
  const domain = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
  const token  = process.env.SHOPIFY_ACCESS_TOKEN!;

  const [firstName, ...rest] = (customer.name || "Guest").trim().split(" ");
  const lastName = rest.join(" ") || "-";

  const address = {
    first_name: firstName,
    last_name:  lastName,
    address1:   customer.address || "",
    city:       customer.city    || "",
    country:    customer.country || "AE",
    phone:      customer.phone   || "",
  };

  const lineItems = items.map((item) =>
    item.variant_id
      ? { variant_id: parseInt(item.variant_id, 10), quantity: item.quantity }
      : {
          title:             item.product_title,
          price:             item.price.toFixed(2),
          quantity:          item.quantity,
          requires_shipping: true,
          taxable:           false,
        },
  );

  // Build draft order body
  const draftBody: Record<string, unknown> = {
    line_items:       lineItems,
    email:            customer.email,
    shipping_address: address,
    billing_address:  address,
    // ✅ Fixed: correct payment provider name and payment ID
    note:             `Paid via Tabby. Payment ID: ${tabbyPaymentId}`,
    // ✅ Fixed: correct tags
    tags:             "Tabby, BNPL, custom-checkout",
    send_receipt:     true,
    currency,
    // ✅ Pass shipping as a custom line or shipping line
    ...(shipping > 0 && {
      shipping_line: {
        title:  "Shipping",
        price:  shipping.toFixed(2),
        code:   "TABBY_SHIPPING",
      },
    }),
    // ✅ Pass discount if any
    ...(discountCode && discountAmount > 0 && {
      applied_discount: {
        title:        discountCode,
        value:        discountAmount.toFixed(2),
        value_type:   "fixed_amount",
        description:  `Discount code: ${discountCode}`,
      },
    }),
  };

    const draftRes = await fetch(
      `https://${domain}/admin/api/2024-01/draft_orders.json`,
      {
        method:  "POST",
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type":           "application/json",
        },
        body: JSON.stringify({ draft_order: draftBody }),
      },
    );

  if (!draftRes.ok) {
    throw new Error(`Shopify draft order error: ${await draftRes.text()}`);
  }

  const { draft_order: draft } = await draftRes.json();

  const completeRes = await fetch(
    `https://${domain}/admin/api/2024-01/draft_orders/${draft.id}/complete.json?payment_pending=false`,
    {
      method:  "PUT",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type":           "application/json",
      },
    },
  );

  if (!completeRes.ok) {
    console.warn("[Tabby webhook] Shopify order completion failed for draft:", draft.id);
    return draft.name;
  }

  const { draft_order: completed } = await completeRes.json();
  return completed.name;
}

// ── Webhook handler ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // ✅ Clone request before reading body so signature check can also read headers
  if (!verifyTabbySignature(request)) {
    console.warn("[Tabby webhook] Invalid signature — rejecting request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("[Tabby webhook] Received:", JSON.stringify(body, null, 2));

  // ── Tabby webhook payload reference ──────────────────────────────────────
  // {
  //   id:      "wh_xxxx",
  //   status:  "CLOSED",           ← top-level webhook event status
  //   payment: {
  //     id:     "pay_xxxx",
  //     status: "CLOSED",          ← ✅ payment status is "CLOSED" when paid, NOT "AUTHORIZED"
  //     amount: "100.00",
  //     currency: "AED",
  //   },
  //   order: { reference_id: "..." },
  // }

  // ✅ Fixed: Tabby payment status is "CLOSED" (not "AUTHORIZED") when successfully paid
  if (body.status !== "CLOSED" || body.payment?.status !== "CLOSED") {
    console.log("[Tabby webhook] Ignoring non-CLOSED event:", body.status, body.payment?.status);
    return NextResponse.json({ received: true });
  }

  const token = body.meta?.token || body.order?.reference_id;
  if (!token) {
    console.error("[Tabby webhook] No token/reference_id in payload");
    return NextResponse.json({ received: true });
  }

  try {
    const checkoutPayload = await verifyCheckoutToken(token);


    const currency = body.payment?.currency || checkoutPayload.currency || "AED";

    const orderName = await createShopifyOrder(
      checkoutPayload.items,
      checkoutPayload.customer,
      currency,
      body.payment.id,
      checkoutPayload.shipping   ?? 0,
      checkoutPayload.discountAmount ?? 0,
      checkoutPayload.discountCode,
    );

    // ✅ Fixed: await markTokenUsed to prevent race-condition replay attacks
    await markTokenUsed(token);

    console.log(`[Tabby webhook] Order created: ${orderName} | Payment: ${body.payment.id} | Currency: ${currency}`);
  } catch (err) {
    console.error("[Tabby webhook] Failed:", err);
    // Still return 200 so Tabby doesn't retry — log and handle manually
    // Change to 500 if you want Tabby to retry on failure
  }

  return NextResponse.json({ received: true });
}