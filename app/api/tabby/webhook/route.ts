import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import type { CartItem, CustomerInfo } from "@/types/checkout.types";
import { verifyCheckoutToken } from "@/app/lib/checkout-token";
import { markTokenUsed } from "@/app/lib/used-tokens";

export const runtime = "nodejs";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// ── Signature verification ─────────────────────────────────────────────────────
function verifyTabbySignature(request: NextRequest): boolean {
  const incoming =
    request.headers.get("x-webhook-signature") ??
    request.headers.get("x-tabby-signature");

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
    const raw = await redis.get(`tabby_checkout:${referenceId}`);
    if (raw) {
      console.log("[Tabby webhook] Resolved payload via Redis:", referenceId);
      const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
      return { payload, tokenKey: referenceId };
    }
    console.error("[Tabby webhook] Redis key not found: tabby_checkout:" + referenceId);
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
  const apiBase = "https://api.tabby.ai";

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
  currency: string,
  tabbyPaymentId: string,
  shipping: number = 0,
  discountAmount: number = 0,
  discountCode?: string,
): Promise<string> {
  const domain = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
  const token = process.env.SHOPIFY_ACCESS_TOKEN!;

  const [firstName, ...rest] = (customer.name || "Guest").trim().split(" ");
  const lastName = rest.join(" ") || "-";

  const address = {
    first_name: firstName,
    last_name: lastName,
    address1: customer.address || "",
    city: customer.city || "",
    country: customer.country || "AE",
    phone: customer.phone || "",
  };

  const lineItems = items.map((item) =>
    item.variant_id
      ? { variant_id: parseInt(item.variant_id, 10), quantity: item.quantity }
      : {
          title: item.product_title,
          price: item.price.toFixed(2),
          quantity: item.quantity,
          requires_shipping: true,
          taxable: false,
        },
  );

  const draftBody: Record<string, unknown> = {
    line_items: lineItems,
    email: customer.email,
    shipping_address: address,
    billing_address: address,
    note: `Paid via Tabby. Payment ID: ${tabbyPaymentId}`,
    tags: "Tabby, BNPL, custom-checkout",
    send_receipt: true,
    currency,
    ...(shipping > 0 && {
      shipping_line: {
        title: "Shipping",
        price: shipping.toFixed(2),
        code: "TABBY_SHIPPING",
      },
    }),
    ...(discountCode &&
      discountAmount > 0 && {
        applied_discount: {
          title: discountCode,
          value: discountAmount.toFixed(2),
          value_type: "fixed_amount",
          description: `Discount code: ${discountCode}`,
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
  return completed.name;
}

// ── Webhook handler ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
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
  const isClosed = status === "closed" || body.closed_at !== null;

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
    const wasSet = await redis.set(idempotencyKey, "1", {
      ex: 60 * 60 * 24 * 7,
      nx: true, // only sets if key doesn't exist — atomic, no race condition
    });

    if (wasSet === null) {
      // null means key already existed — already processed
      console.log("[Tabby webhook] Already processed:", tabbyPaymentId);
      return NextResponse.json({ received: true });
    }
  } catch (err) {
    // Don't proceed — better to make Tabby retry than create a duplicate order
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
      currency,
      tabbyPaymentId,
      checkoutPayload.shipping ?? 0,
      checkoutPayload.discountAmount ?? 0,
      checkoutPayload.discountCode,
    );console.log("[Tabby webhook] Payment ID:", body.id);
console.log("[Tabby webhook] Status:", body.status);
console.log("[Tabby webhook] Captures:", JSON.stringify(body.captures));
console.log("[Tabby webhook] closed_at:", body.closed_at);
console.log("[Tabby webhook] meta:", JSON.stringify(body.meta));
console.log("[Tabby webhook] order:", JSON.stringify(body.order));

    if (jwtToken) await markTokenUsed(jwtToken);
    if (referenceId) await redis.del(`tabby_checkout:${referenceId}`);

    console.log(
      `[Tabby webhook] ✅ Order created: ${orderName} | Payment: ${tabbyPaymentId} | Currency: ${currency}`,
    );
  } catch (err) {
    // Order creation failed — delete idempotency key so Tabby can retry
    await redis.del(idempotencyKey);
    console.error(
      "[Tabby webhook] Order creation failed, idempotency key cleared for retry:",
      err,
    );
    return NextResponse.json({ error: "Order creation failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}