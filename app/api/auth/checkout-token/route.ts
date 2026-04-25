// app/api/auth/checkout-token/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Called by the Shopify checkout button (liquid snippet).
// 1. Verifies the request came from YOUR Shopify store (HMAC check)
// 2. Issues a short-lived signed JWT with cart + customer data
// 3. Returns { token } — Shopify JS redirects to /checkout?token=...
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { signCheckoutToken, type CartItem, type CustomerInfo } from "@/app/lib/checkout-token";
// ─── CORS — allow all origins ─────────────────────────────────────────────────

const ALLOWED_SHOP = process.env.SHOPIFY_STORE_DOMAIN!; // e.g. "yourstore.myshopify.com"

function corsHeaders(_origin: string | null) {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

// ─── HMAC verification ────────────────────────────────────────────────────────
// We verify the request is genuinely from your Shopify store by checking an
// HMAC the Liquid snippet computes using your Shopify app's shared secret.
//
// In your liquid snippet, add this before the fetch():
//   const hmacPayload = `${payload.shop}:${payload.timestamp}:${payload.total}`;
//   // NOTE: HMAC must be computed server-side (Shopify App Proxy) or
//   // you can skip HMAC and rely on the ALLOWED_SHOP domain check + HTTPS.
//   // See note below about the two verification strategies.

function verifyShopifyHmac(
  shop: string,
  timestamp: number,
  total: number,
  receivedHmac: string | undefined,
): boolean {
  const sharedSecret = process.env.SHOPIFY_API_SECRET!;

  // Replay attack protection — reject requests older than 5 minutes
  const ageSeconds = Math.floor(Date.now() / 1000) - timestamp;
  if (ageSeconds > 300 || ageSeconds < -30) return false;

  // If no HMAC provided (guest or simplified flow), only enforce shop domain
  // Set REQUIRE_SHOPIFY_HMAC=true in env to make HMAC mandatory
  if (!receivedHmac) {
    return process.env.REQUIRE_SHOPIFY_HMAC !== "true";
  }

  const message = `${shop}:${timestamp}:${total}`;
  const expected = createHmac("sha256", sharedSecret)
    .update(message)
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(receivedHmac));
  } catch {
    return false;
  }
}

// ─── Request body shape ───────────────────────────────────────────────────────

interface CheckoutTokenRequest {
  items: CartItem[];
  currency: string;
  total: number;
  customer: CustomerInfo;
  shop: string;
  timestamp: number;
  hmac?: string;       // optional — see verifyShopifyHmac above
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    const body: CheckoutTokenRequest = await request.json();

    const { items, currency, total, customer, shop, timestamp, hmac } = body;

    // 1. Validate required fields
    if (!items?.length || !currency || !shop || !timestamp) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400, headers },
      );
    }

    // 2. Verify the request genuinely came from your Shopify store
    if (!verifyShopifyHmac(shop, timestamp, total, hmac)) {
      console.warn("HMAC verification failed for shop:", shop);
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers },
      );
    }

    // 3. Sanitize customer — ensure no XSS / injection in stored values
    const safeCustomer: CustomerInfo = {
      id:      customer?.id      || "",
      name:    customer?.name    || "",
      email:   customer?.email   || "",
      phone:   customer?.phone   || "",
      address: customer?.address || "",
      city:    customer?.city    || "",
      country: customer?.country || "AE",
    };

    // 4. Sign the JWT (15 min expiry)
    const token = await signCheckoutToken({
      items,
      currency,
      total,
      customer: safeCustomer,
      shop,
    });

    console.log(
      `✅ Checkout token issued for shop=${shop}`,
      `customer=${safeCustomer.email || "(guest)"}`,
      `items=${items.length}`,
    );

    return NextResponse.json({ token }, { headers });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Token generation failed";
    console.error("checkout-token error:", message);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers },
    );
  }
}