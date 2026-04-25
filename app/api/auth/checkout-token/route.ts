// app/api/auth/checkout-token/route.ts

import { NextRequest, NextResponse } from "next/server";
import { signCheckoutToken, type CartItem, type CustomerInfo } from "@/app/lib/checkout-token";

// ─── CORS — allow all origins ─────────────────────────────────────────────────

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

// ─── Request body shape ───────────────────────────────────────────────────────

interface CheckoutTokenRequest {
  items: CartItem[];
  currency: string;
  total: number;
  customer: CustomerInfo;
  shop: string;
  timestamp: number;
  hmac?: string;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const headers = corsHeaders();

  try {
    const body: CheckoutTokenRequest = await request.json();

    const { items, currency, total, customer, shop, timestamp } = body;

    // 1. Validate required fields
    if (!items?.length || !currency || !shop || !timestamp) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400, headers },
      );
    }

    // 2. Replay attack protection — reject requests older than 5 minutes
    const ageSeconds = Math.floor(Date.now() / 1000) - timestamp;
    if (ageSeconds > 300 || ageSeconds < -30) {
      return NextResponse.json(
        { error: "Request expired" },
        { status: 401, headers },
      );
    }

    // NOTE: HMAC verification skipped — no hmac is sent from the Liquid snippet.
    // Re-enable once you add server-side HMAC signing to your Shopify App Proxy.

    // 3. Sanitize customer
    const safeCustomer: CustomerInfo = {
      id:      customer?.id      || "",
      name:    customer?.name    || "",
      email:   customer?.email   || "",
      phone:   customer?.phone   || "",
      address: customer?.address || "",
      city:    customer?.city    || "",
      country: customer?.country || "AE",
    };

    // 4. Sign the JWT
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
    // Expose real error message so you can diagnose from the browser/network tab
    const message = err instanceof Error ? err.message : "Token generation failed";
    console.error("checkout-token error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500, headers },
    );
  }
}