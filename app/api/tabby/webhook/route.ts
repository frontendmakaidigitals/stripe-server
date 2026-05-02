import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import type { CartItem, CustomerInfo } from "@/types/checkout.types";
import { verifyCheckoutToken } from "@/app/lib/checkout-token";
import { markTokenUsed, isTokenUsed } from "@/app/lib/used-tokens";

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
// Try JWT token first, fall back to Redis lookup by referenceId
async function resolveCheckoutPayload(
  jwtToken: string | undefined,
  referenceId: string | undefined,
) {
  // 1. Try JWT if present and non-empty
  if (jwtToken) {
    try {
      const payload = await verifyCheckoutToken(jwtToken);
      console.log("[Tabby webhook] Resolved payload via JWT token");
      return { payload, tokenKey: jwtToken };
    } catch (err) {
      console.warn("[Tabby webhook] JWT verify failed, trying Redis fallback:", err);
    }
  }

  // 2. Fall back to Redis lookup by referenceId
  if (referenceId) {
    const raw = await redis.get(`tabby_checkout:${referenceId}`);
    if (raw) {
      console.log("[Tabby webhook] Resolved payload via Redis referenceId:", referenceId);
      const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
      return { payload, tokenKey: referenceId };
    }
  }

  throw new Error(`No checkout payload found for token=${jwtToken} referenceId=${referenceId}`);
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
    console.warn("[Tabby webhook] Shopify order completion failed for draft:", draft.id);
    return draft.name;
  }

  const { draft_order: completed } = await completeRes.json();
  return completed.name;
}

// ── Webhook handler ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
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

  const tabbyPaymentId = body.id;
  const currency = body.currency || "AED";
  const status = (body.status || "").toLowerCase();

  // ✅ Tabby quirk: status stays "authorized" even after capture
  // Detect actual completion by checking captures array or closed_at
  const isActuallyClosed =
    status === "closed" ||
    body.closed_at !== null ||
    (Array.isArray(body.captures) && body.captures.length > 0);

  if (!isActuallyClosed) {
    console.log("[Tabby webhook] Payment not yet captured, ignoring. Status:", status);
    return NextResponse.json({ received: true });
  }

  const referenceId: string | undefined = body.order?.reference_id;
  const jwtToken: string | undefined =
    body.meta?.token || body.token || undefined;

  console.log("[Tabby webhook] resolving checkout — referenceId:", referenceId, "| hasJwt:", !!jwtToken);

  // ── Idempotency: skip if already processed ─────────────────────
  const idempotencyKey = `tabby_processed:${tabbyPaymentId}`;
  try {
    const alreadyProcessed = await redis.get(idempotencyKey);
    if (alreadyProcessed) {
      console.log("[Tabby webhook] Already processed, skipping:", tabbyPaymentId);
      return NextResponse.json({ received: true });
    }
  } catch (err) {
    console.warn("[Tabby webhook] Redis idempotency check failed:", err);
  }

  try {
    const { payload: checkoutPayload, tokenKey } = await resolveCheckoutPayload(
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
    );

    // Mark as processed in Redis (idempotency)
    await redis.set(idempotencyKey, "1", { ex: 60 * 60 * 24 * 7 });

    // Mark JWT token used if it was a JWT
    if (jwtToken) await markTokenUsed(jwtToken);

    // Clean up Redis checkout payload
    if (referenceId) await redis.del(`tabby_checkout:${referenceId}`);

    console.log(
      `[Tabby webhook] ✅ Order created: ${orderName} | Payment: ${tabbyPaymentId} | Currency: ${currency}`,
    );
  } catch (err) {
    console.error("[Tabby webhook] Failed:", err);
  }

  return NextResponse.json({ received: true });
}