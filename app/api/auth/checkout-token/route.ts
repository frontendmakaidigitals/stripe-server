// app/api/auth/checkout-token/route.ts

import { NextRequest, NextResponse } from "next/server";
import { signCheckoutToken, type CartItem, type CustomerInfo } from "@/app/lib/checkout-token";

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

interface CheckoutTokenRequest {
  items: CartItem[];
  currency: string;
  total: number;
  customer: CustomerInfo;
  shop: string;
  timestamp: number;
  hmac?: string;
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders();

  try {
    const body: CheckoutTokenRequest = await request.json();
    const { items, currency, total, customer, shop, timestamp } = body;

    if (!items?.length || !currency || !shop || !timestamp) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400, headers },
      );
    }

    const ageSeconds = Math.floor(Date.now() / 1000) - timestamp;
    if (ageSeconds > 300 || ageSeconds < -30) {
      return NextResponse.json(
        { error: "Request expired" },
        { status: 401, headers },
      );
    }

    const safeCustomer: CustomerInfo = {
      id:        customer?.id        || "",
      name:      customer?.name      || "",
      email:     customer?.email     || "",
      phone:     customer?.phone     || "",
      address:   customer?.address   || "",
      city:      customer?.city      || "",
      country:   customer?.country   || "AE",
      addresses: customer?.addresses ?? [],
    };

    const token = await signCheckoutToken({
      items,
      currency,
      total,
      customer: safeCustomer,
      shop,
    });
 
    return NextResponse.json({ token }, { headers });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Token generation failed";
    console.error("checkout-token error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500, headers },
    );
  }
}