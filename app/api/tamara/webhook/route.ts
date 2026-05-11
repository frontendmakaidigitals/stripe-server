import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import redis from "@/app/lib/redis";
import type { CartItem, CustomerInfo } from "@/types/checkout.types";
import { markTokenUsed } from "@/app/lib/used-tokens";

export const runtime = "nodejs";

function verifyTamaraToken(request: NextRequest): void {
  const authHeader = request.headers.get("authorization") ?? "";
  const token      = authHeader.replace(/^Bearer\s+/i, "").trim();

  console.log("[Tamara webhook] Verifying token — present:", !!token);

  if (!token) {
    throw new Error("Missing tamaraToken in Authorization header");
  }

  jwt.verify(token, process.env.TAMARA_NOTIFICATION_TOKEN!, {
    algorithms: ["HS256"],
  });

  console.log("[Tamara webhook] Token verified ✅");
}

// ── Tamara API helpers ─────────────────────────────────────────────────────────
async function tamaraPost(path: string, body: object = {}): Promise<any> {
  console.log(`[Tamara webhook] POST ${process.env.TAMARA_API_URL}${path}`);

  const res = await fetch(`${process.env.TAMARA_API_URL}${path}`, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${process.env.TAMARA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`[Tamara webhook] tamaraPost ${path} failed — status:`, res.status, "body:", text);
    throw new Error(`Tamara ${path} failed (${res.status}): ${text}`);
  }

  console.log(`[Tamara webhook] tamaraPost ${path} success — status:`, res.status);
  return JSON.parse(text);
}

async function authoriseOrder(tamaraOrderId: string): Promise<{ autoCaptured: boolean }> {
  console.log(`[Tamara webhook] Authorising order ${tamaraOrderId}...`);
  const result = await tamaraPost(`/orders/${tamaraOrderId}/authorise`);
  console.log(`[Tamara webhook] Authorised order ${tamaraOrderId} auto_captured=${result.auto_captured}`);
  return { autoCaptured: result.auto_captured === true };
}

async function captureOrder(
  tamaraOrderId: string,
  items: CartItem[],
  shipping: number,
  discountAmount: number,
  currency: string,
): Promise<void> {
  const toAmount = (val: number) => ({
    amount:   parseFloat(val.toFixed(2)),
    currency: currency.toUpperCase(),
  });

  const itemTotal  = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const grandTotal = Math.max(0, itemTotal + shipping - discountAmount);

  console.log(`[Tamara webhook] Capturing order ${tamaraOrderId} — itemTotal=${itemTotal} shipping=${shipping} discount=${discountAmount} grandTotal=${grandTotal} currency=${currency}`);

  await tamaraPost("/payments/capture", {
    order_id:     tamaraOrderId,
    total_amount: toAmount(grandTotal),
    items: items.map((item) => ({
      reference_id:    item.variant_id || item.product_title,
      type:            "Physical",
      name:            item.product_title,
      sku:             item.variant_id || "",
      quantity:        item.quantity,
      unit_price:      toAmount(item.price),
      total_amount:    toAmount(item.price * item.quantity),
      discount_amount: toAmount(0),
      tax_amount:      toAmount(0),
    })),
    shipping_amount: toAmount(shipping),
    discount_amount: toAmount(discountAmount),
    tax_amount:      toAmount(0),
    shipping_info: {
      shipped_at:       new Date().toISOString(),
      shipping_company: "Standard Shipping",
      tracking_number:  "",
      tracking_url:     "",
    },
  });

  console.log(`[Tamara webhook] ✅ Captured order ${tamaraOrderId}`);
}

// ── Shopify order creation ─────────────────────────────────────────────────────
async function createShopifyOrder(
  items: CartItem[],
  customer: CustomerInfo,
  tamaraOrderId: string,
  shipping: number = 0,
  shippingHandle: string = "Shipping",
  discountAmount: number = 0,
  discountCode?: string,
): Promise<string> {
  const domain = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
  const token  = process.env.SHOPIFY_ACCESS_TOKEN!;

  const [firstName, ...rest] = (customer.name || "Guest").trim().split(" ");
  const lastName = rest.join(" ") || "-";

  const isUAE =
    customer.country?.trim().toLowerCase() === "united arab emirates" ||
    customer.country?.trim().toUpperCase() === "AE";

  console.log(`[Tamara webhook] Creating Shopify draft order — customer=${customer.email} items=${items.length} shipping=${shipping} discount=${discountAmount} isUAE=${isUAE}`);

  const address = {
    first_name: firstName,
    last_name:  lastName,
    address1:   customer.address  || "",
    address2:   customer.address2 || "",
    city:       customer.city     || "",
    province:   customer.province || "",
    zip:        customer.zip      || "",
    country:    customer.country  || "AE",
    phone:      customer.phone    || "",
  };

  const lineItems: object[] = items.map((item) => ({
    title:             item.product_title,
    sku:               item.sku || item.variant_id || "",
    price:             item.price.toFixed(2),
    quantity:          item.quantity,
    requires_shipping: true,
    taxable:           isUAE,
  }));

  const draftRes = await fetch(
    `https://${domain}/admin/api/2024-01/draft_orders.json`,
    {
      method:  "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type":           "application/json",
      },
      body: JSON.stringify({
        draft_order: {
          line_items:       lineItems,
          email:            customer.email,
          shipping_address: address,
          billing_address:  address,
          tax_exempt:       !isUAE,
          taxes_included:   true,
          note:             `Paid via Tamara. Order ID: ${tamaraOrderId}`,
          tags:             "Tamara, BNPL, custom-checkout",
          send_receipt:     true,
          ...(shipping > 0 && {
            shipping_line: {
              title:   shippingHandle,
              price:   shipping.toFixed(2),
              taxable: true,
            },
          }),
          ...(discountCode && discountAmount > 0 && {
            applied_discount: {
              value_type:  "fixed_amount",
              value:       discountAmount.toFixed(2),
              amount:      discountAmount.toFixed(2),
              title:       discountCode,
              description: `Discount code: ${discountCode}`,
            },
          }),
        },
      }),
    },
  );

  if (!draftRes.ok) {
    const errText = await draftRes.text();
    console.error("[Tamara webhook] Shopify draft order failed — status:", draftRes.status, "body:", errText);
    throw new Error(`Shopify draft order error: ${errText}`);
  }

  const { draft_order: draft } = await draftRes.json();
  console.log(`[Tamara webhook] Shopify draft order created — draft.id=${draft.id} draft.name=${draft.name}`);

  console.log(`[Tamara webhook] Completing Shopify draft order ${draft.id}...`);
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
    console.warn("[Tamara webhook] Shopify completion failed — status:", completeRes.status, "draft.id:", draft.id, "— returning draft name as fallback");
    return draft.name;
  }

  const { draft_order: completed } = await completeRes.json();
  console.log(`[Tamara webhook] ✅ Shopify order completed — name=${completed.name}`);
  return completed.name;
}

// ── Webhook handler ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  console.log("[Tamara webhook] HIT — headers:", Object.fromEntries(request.headers));

  // Step 1: Verify JWT from Tamara
  try {
    verifyTamaraToken(request);
  } catch (err) {
    console.warn("[Tamara webhook] Invalid token:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Step 2: Parse body
  let body: any;
  try {
    body = await request.json();
  } catch {
    console.error("[Tamara webhook] Failed to parse request body as JSON");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { event_type, order_id: tamaraOrderId, order_reference_id: referenceId } = body;

  console.log(`[Tamara webhook] event=${event_type} tamaraOrderId=${tamaraOrderId} referenceId=${referenceId}`);

  // Step 3: Route by event type
  switch (event_type) {

    // ── approved ──────────────────────────────────────────────────────────
    case "order_approved": {
      console.log(`[Tamara webhook] Handling order_approved for ${tamaraOrderId}`);
      try {
        const { autoCaptured } = await authoriseOrder(tamaraOrderId);
        if (autoCaptured) {
          console.log(`[Tamara webhook] Auto-captured — skipping manual capture for ${tamaraOrderId}`);
        } else {
          console.log(`[Tamara webhook] Not auto-captured — waiting for order_authorised event`);
        }
      } catch (err) {
        console.error("[Tamara webhook] Authorise failed:", err);
        return NextResponse.json({ error: "Authorise failed" }, { status: 500 });
      }
      break;
    }

    // ── authorised ────────────────────────────────────────────────────────
    case "order_authorised": {
      console.log(`[Tamara webhook] Handling order_authorised for ${tamaraOrderId} — looking up Redis key tamara_checkout:${referenceId}`);
      let checkoutPayload: any;
      try {
        const raw = await redis.get(`tamara_checkout:${referenceId}`);
        if (!raw) throw new Error(`Redis key not found: tamara_checkout:${referenceId}`);
        checkoutPayload = typeof raw === "string" ? JSON.parse(raw) : raw;
        console.log(`[Tamara webhook] Redis payload found — items=${checkoutPayload.items?.length} customer=${checkoutPayload.customer?.email}`);
      } catch (err) {
        console.error("[Tamara webhook] Redis lookup failed on authorised:", err);
        return NextResponse.json({ error: "Order data not found" }, { status: 500 });
      }

      try {
        await captureOrder(
          tamaraOrderId,
          checkoutPayload.items,
          checkoutPayload.shipping       ?? 0,
          checkoutPayload.discountAmount ?? 0,
          checkoutPayload.currency       ?? "AED",
        );
      } catch (err) {
        console.error("[Tamara webhook] Capture failed:", err);
        return NextResponse.json({ error: "Capture failed" }, { status: 500 });
      }
      break;
    }

    // ── captured ──────────────────────────────────────────────────────────
    case "order_captured": {
      console.log(`[Tamara webhook] Handling order_captured for ${tamaraOrderId}`);

      const idempotencyKey = `tamara_processed:${tamaraOrderId}`;
      console.log(`[Tamara webhook] Checking idempotency key: ${idempotencyKey}`);
      try {
        const wasSet = await redis.set(idempotencyKey, "1", "EX", 60 * 60 * 24 * 7, "NX");
        if (wasSet === null) {
          console.log("[Tamara webhook] Already processed — skipping:", tamaraOrderId);
          return NextResponse.json({ received: true });
        }
        console.log("[Tamara webhook] Idempotency key set — proceeding");
      } catch (err) {
        console.error("[Tamara webhook] Idempotency Redis error — aborting:", err);
        return NextResponse.json({ error: "Redis error" }, { status: 500 });
      }

      console.log(`[Tamara webhook] Looking up Redis key tamara_checkout:${referenceId}`);
      let checkoutPayload: any;
      try {
        const raw = await redis.get(`tamara_checkout:${referenceId}`);
        if (!raw) throw new Error(`Redis key not found: tamara_checkout:${referenceId}`);
        checkoutPayload = typeof raw === "string" ? JSON.parse(raw) : raw;
        console.log(`[Tamara webhook] Redis payload found — items=${checkoutPayload.items?.length} customer=${checkoutPayload.customer?.email} shipping=${checkoutPayload.shipping} discount=${checkoutPayload.discountAmount}`);
      } catch (err) {
        await redis.del(idempotencyKey);
        console.error("[Tamara webhook] Redis lookup failed on captured — cleared idempotency key:", err);
        return NextResponse.json({ error: "Order data not found" }, { status: 500 });
      }

      console.log(`[Tamara webhook] Creating Shopify order for Tamara order ${tamaraOrderId}...`);
      try {
        const orderName = await createShopifyOrder(
          checkoutPayload.items,
          checkoutPayload.customer,
          tamaraOrderId,
          checkoutPayload.shipping       ?? 0,
          checkoutPayload.shippingHandle ?? "Shipping",
          checkoutPayload.discountAmount ?? 0,
          checkoutPayload.discountCode,
        );

        if (referenceId && orderName) {
          await redis.set(`tamara_order:${referenceId}`, orderName, "EX", 60 * 60 * 24 * 7);
          console.log(`[Tamara webhook] Stored tamara_order:${referenceId} = ${orderName}`);
        }

        console.log(`✅ Shopify order ${orderName} created for Tamara order ${tamaraOrderId}`);
      } catch (err) {
        await redis.del(idempotencyKey);
        console.error("[Tamara webhook] Shopify order creation failed — cleared idempotency key:", err);
        return NextResponse.json({ error: "Order creation failed" }, { status: 500 });
      }

      console.log(`[Tamara webhook] Cleaning up — marking token used and deleting Redis checkout payload`);
      if (checkoutPayload.token) {
        try { await markTokenUsed(checkoutPayload.token); console.log("[Tamara webhook] Token marked used"); } catch (err) { console.warn("[Tamara webhook] markTokenUsed failed:", err); }
      }
      if (referenceId) {
        try { await redis.del(`tamara_checkout:${referenceId}`); console.log(`[Tamara webhook] Deleted tamara_checkout:${referenceId}`); } catch (err) { console.warn("[Tamara webhook] Redis cleanup failed:", err); }
      }

      break;
    }

    // ── declined / expired / canceled / refunded ──────────────────────────
    case "order_declined":
    case "order_expired":
    case "order_canceled":
    case "order_refunded": {
      console.warn(`[Tamara webhook] Order ${tamaraOrderId} — ${event_type}`);
      break;
    }

    default: {
      console.log(`[Tamara webhook] Unhandled event: ${event_type}`);
    }
  }

  console.log(`[Tamara webhook] ✅ Responding 200 for event=${event_type} tamaraOrderId=${tamaraOrderId}`);
  return NextResponse.json({ received: true });
}