import { NextRequest, NextResponse } from "next/server";
import redis from "@/app/lib/redis";
import type { CartItem, CustomerInfo } from "@/types/checkout.types";
import { verifyCheckoutToken } from "@/app/lib/checkout-token";
import { markTokenUsed } from "@/app/lib/used-tokens";

export const runtime = "nodejs";

// ── Signature verification ─────────────────────────────────────────────────────
function verifyTabbySignature(request: NextRequest): boolean {
  const incoming =
    request.headers.get("x-webhook-signature") ??
    request.headers.get("x-tabby-signature");

  console.log("[Tabby webhook] Incoming:", incoming);
  console.log("[Tabby webhook] AED secret:", process.env.TABBY_WEBHOOK_SECRET_AED);
  console.log("[Tabby webhook] Match:", incoming === process.env.TABBY_WEBHOOK_SECRET_AED);

  const secrets = [
    process.env.TABBY_WEBHOOK_SECRET_AED,
    process.env.TABBY_WEBHOOK_SECRET_KWD,
    process.env.TABBY_WEBHOOK_SECRET_SAR,
  ].filter(Boolean);

  return secrets.some((s) => s === incoming);
}

// ── Resolve checkout payload ───────────────────────────────────────────────────
async function resolveCheckoutPayload(
  jwtToken: string | undefined,
  referenceId: string | undefined,
) {
  if (jwtToken) {
    try {
      const payload = await verifyCheckoutToken(jwtToken);
      console.log("[Tabby webhook] Resolved payload via JWT token");
      return { payload, tokenKey: jwtToken };
    } catch (err) {
      console.warn("[Tabby webhook] JWT verify failed, trying Redis:", err);
    }
  }

  if (referenceId) {
    // ✅ Fix 1: read from tabby_display: not tabby_checkout:
    const raw = await redis.get(`tabby_display:${referenceId}`);
    if (raw) {
      console.log("[Tabby webhook] Resolved payload via Redis:", referenceId);
      const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
      return { payload, tokenKey: referenceId };
    }
    console.error("[Tabby webhook] Redis key not found: tabby_display:" + referenceId);
  }

  throw new Error(
    `No checkout payload found. token=${!!jwtToken} referenceId=${referenceId}`,
  );
}

// ── Capture payment ────────────────────────────────────────────────────────────
async function captureTabbyPayment(
  paymentId: string,
  amount: string,
  currency: string,
): Promise<void> {
  // ✅ Fix 2: SAR uses api.tabby.sa, others use api.tabby.ai
  const apiBase =
    currency === "SAR" ? "https://api.tabby.sa" : "https://api.tabby.ai";

  const secretKey =
    currency === "SAR"
      ? process.env.TABBY_SECRET_KEY_SAR
      : currency === "KWD"
        ? process.env.TABBY_SECRET_KEY_KWD
        : process.env.TABBY_SECRET_KEY_AED;

  console.log("[Tabby webhook] Capturing with key prefix:", secretKey?.slice(0, 12));

  const res = await fetch(`${apiBase}/api/v1/payments/${paymentId}/captures`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount }),
  });

  const text = await res.text();
  console.log("[Tabby webhook] Capture response:", res.status, text);

  if (!res.ok) {
    throw new Error(`Tabby capture failed (${res.status}): ${text}`);
  }
}

// ── Shopify order creation ─────────────────────────────────────────────────────
async function createShopifyOrder(
  items: CartItem[],
  customer: CustomerInfo,
  tabbyPaymentId: string,
  shipping: number = 0,
  shippingHandle: string = "Shipping",
  discountAmount: number = 0,
  discountCode?: string,
): Promise<string> {
  const domain = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
  const token = process.env.SHOPIFY_ACCESS_TOKEN!;

  const [firstName, ...rest] = (customer.name || "Guest").trim().split(" ");
  const lastName = rest.join(" ") || "-";

  const isUAE =
    customer.country?.trim().toLowerCase() === "united arab emirates" ||
    customer.country?.trim().toUpperCase() === "AE";

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

  const draftBody: Record<string, unknown> = {
    line_items:       lineItems,
    email:            customer.email,
    shipping_address: address,
    billing_address:  address,
    tax_exempt:       !isUAE,
    note:             `Paid via Tabby. Payment ID: ${tabbyPaymentId}`,
    tags:             "Tabby, BNPL, custom-checkout",
    send_receipt:     true,
    taxes_included:   true,
    ...(shipping > 0 && {
      shipping_line: {
        title:   shippingHandle,
        price:   shipping.toFixed(2),
        code:    "TABBY_SHIPPING",
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
        taxable:     true,
      },
    }),
  };

  const draftRes = await fetch(
    `https://${domain}/admin/api/2024-01/draft_orders.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
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
      method: "PUT",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    },
  );

  if (!completeRes.ok) {
    console.warn(
      "[Tabby webhook] Shopify completion failed for draft:",
      draft.id,
      await completeRes.text(),
    );
    return draft.name;
  }

  const { draft_order: completed } = await completeRes.json();

  if (!completed.order_id) {
    console.warn("[Tabby webhook] No order_id after completion. Draft:", completed.name);
    return completed.name;
  }

  const orderRes = await fetch(
    `https://${domain}/admin/api/2024-01/orders/${completed.order_id}.json`,
    {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type":           "application/json",
      },
    },
  );

  if (!orderRes.ok) {
    console.warn("[Tabby webhook] Could not fetch real order, falling back");
    return `#${completed.order_id}`;
  }

  const { order } = await orderRes.json();
  console.log(`[Tabby webhook] Real order: ${order.name} (${order.id})`);
  return order.name;
}

// ── Webhook handler ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  console.log("[Tabby webhook] HIT — headers:", Object.fromEntries(request.headers));

  if (!verifyTabbySignature(request)) {
    console.warn("[Tabby webhook] Invalid signature — rejecting");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("[Tabby webhook] Received:", JSON.stringify(body, null, 2));

  const tabbyPaymentId: string = body.id;
  const currency: string = body.currency || "AED";
  const status = (body.status || "").toLowerCase();
  const hasCaptured = Array.isArray(body.captures) && body.captures.length > 0;
  // ✅ Fix 3: use loose != to catch both null and undefined
  const isClosed = status === "closed" || (body.closed_at != null);

  // ── Step 1: If authorized and not yet captured → capture it ───────────────
  if (status === "authorized" && !hasCaptured) {
    console.log("[Tabby webhook] Authorized, triggering capture...");
    try {
      await captureTabbyPayment(tabbyPaymentId, body.amount, currency);
      console.log("[Tabby webhook] Capture successful — waiting for closed webhook");
    } catch (err) {
      console.error("[Tabby webhook] Capture failed:", err);
    }
    return NextResponse.json({ received: true });
  }

  // ── Step 2: Only proceed to order creation if captured or closed ──────────
  if (!hasCaptured && !isClosed) {
    console.log("[Tabby webhook] Not captured yet, ignoring. Status:", status);
    return NextResponse.json({ received: true });
  }

  // ── Atomic idempotency check via SET NX ───────────────────────────────────
  const idempotencyKey = `tabby_processed:${tabbyPaymentId}`;
  try {
    const wasSet = await redis.set(idempotencyKey, "1", "EX", 60 * 60 * 24 * 7, "NX");

    if (wasSet === null) {
      console.log("[Tabby webhook] Already processed:", tabbyPaymentId);
      return NextResponse.json({ received: true });
    }
  } catch (err) {
    console.error("[Tabby webhook] Idempotency Redis error — aborting:", err);
    return NextResponse.json({ error: "Redis error" }, { status: 500 });
  }

  const referenceId: string | undefined = body.order?.reference_id;
  const jwtToken: string | undefined =
    (body.meta?.token as string) || (body.token as string) || undefined;

  console.log(
    "[Tabby webhook] Resolving checkout — referenceId:",
    referenceId,
    "| hasJwt:",
    !!jwtToken,
  );

  try {
    const { payload: checkoutPayload } = await resolveCheckoutPayload(
      jwtToken,
      referenceId,
    );

    const orderName = await createShopifyOrder(
      checkoutPayload.items,
      checkoutPayload.customer,
      tabbyPaymentId,
      checkoutPayload.shipping ?? 0,
      checkoutPayload.shippingHandle ?? "Shipping",
      checkoutPayload.discountAmount ?? 0,
      checkoutPayload.discountCode,
    );

    // ✅ Fix 4: store order name so success page can display it
    if (referenceId && orderName) {
      await redis.set(`tabby_order:${referenceId}`, orderName, "EX", 60 * 60 * 24 * 7);
      console.log("[Tabby webhook] Stored order name:", orderName, "for:", referenceId);
    }

    if (jwtToken) await markTokenUsed(jwtToken);
    if (referenceId) await redis.del(`tabby_display:${referenceId}`);

  } catch (err) {
    await redis.del(idempotencyKey);
    console.error(
      "[Tabby webhook] Order creation failed, idempotency key cleared for retry:",
      err,
    );
    return NextResponse.json({ error: "Order creation failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}