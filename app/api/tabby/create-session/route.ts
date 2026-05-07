import { NextRequest, NextResponse } from "next/server";
import type { CartItem, CustomerInfo } from "@/types/checkout.types";
import {
  getTabbyRegion,
  getMerchantCode,
  isTabbyAvailable,
} from "@/app/lib/tabby.config";
import { Redis } from "@upstash/redis";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const {
      items,            // AED prices — stored in Redis for Shopify webhook
      customer,
      currency = "AED", // display currency (SAR/KWD/AED) — used for Tabby routing
      token,
      cancelUrl,
      shipping = 0,           // AED — stored in Redis for Shopify webhook
      shippingHandle = "Shipping",
      discountAmount = 0,     // AED — stored in Redis for Shopify webhook
      discountCode,
      // Display currency values — used for Tabby session amount/items only
      shippingDisplay,
      discountDisplay,
      itemsDisplay,
    } = (await request.json()) as {
      items: CartItem[];
      customer: CustomerInfo;
      currency?: string;
      token?: string;
      cancelUrl?: string;
      shipping?: number;
      shippingHandle?: string;
      discountAmount?: number;
      discountCode?: string;
      shippingDisplay?: number;
      discountDisplay?: number;
      itemsDisplay?: CartItem[];
    };

    if (!items?.length) {
      return NextResponse.json(
        { error: "No items" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const countryCode =
      customer.countryCode ||
      customer.country?.toUpperCase()?.slice(0, 2) ||
      "";

    // Region resolved from display currency — so SAR/KWD routes correctly
    const region = getTabbyRegion(currency, countryCode);

    if (!region) {
      return NextResponse.json(
        {
          error: `Tabby is not available for currency "${currency}" or country "${countryCode}".`,
        },
        { status: 422, headers: CORS_HEADERS },
      );
    }

    const merchantCode = getMerchantCode(region);
    console.log("[Tabby] Merchant code env value:", process.env.TABBY_MERCHANT_KEY_AED);
    console.log("[Tabby] Merchant code used:", merchantCode);

    if (!merchantCode) {
      console.error(`[Tabby] Missing merchant code for region: ${countryCode}`);
      return NextResponse.json(
        { error: "Tabby merchant not configured for this region" },
        { status: 500, headers: CORS_HEADERS },
      );
    }

    // Use display currency items/shipping/discount for Tabby session amount
    // Falls back to AED values if display values not provided (AED customers)
    const displayItems   = itemsDisplay   ?? items;
    const displayShipping  = shippingDisplay  ?? shipping;
    const displayDiscount  = discountDisplay  ?? discountAmount;

    const subtotalDisplay = displayItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const totalDisplay    = Math.max(0, subtotalDisplay + displayShipping - displayDiscount);

    if (!isTabbyAvailable(totalDisplay, region.currency)) {
      return NextResponse.json(
        {
          error: `Order total ${totalDisplay.toFixed(2)} ${region.currency} is outside Tabby's supported range for this region.`,
        },
        { status: 422, headers: CORS_HEADERS },
      );
    }

    const baseUrl     = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";
    const referenceId = `order_${Date.now()}`;

    const payload = {
      payment: {
        amount:      totalDisplay.toFixed(2),    // ← display currency amount for Tabby
        currency:    region.currency,
        description: `Order from ${process.env.NEXT_PUBLIC_STORE_NAME || "Store"}`,
        buyer: {
          email: customer.email || "",
          phone: customer.phone || "",
          name:  customer.name  || "Guest",
          dob:   "1990-01-01",
        },
        shipping_address: {
          city:    customer.city    || "",
          address: customer.address || "",
          zip:     customer.zip     || "",
        },
        order: {
          reference_id: referenceId,
          items: displayItems.map((item) => ({   // ← display currency items for Tabby
            title:      item.product_title,
            quantity:   item.quantity,
            unit_price: item.price.toFixed(2),
            category:   item.variant_id,
          })),
        },
        ...(displayShipping > 0 && {
          shipping_amount: displayShipping.toFixed(2),  // ← display currency for Tabby
        }),
        order_history: [],
        buyer_history: {
          registered_since: new Date().toISOString(),
          loyalty_level:    0,
        },
      },
      merchant_code: merchantCode,
      merchant_urls: {
        success: `${baseUrl}/success?provider=tabby`,
        cancel:  cancelUrl ?? `${baseUrl}/checkout${token ? `?token=${token}` : ""}`,
        failure: `${baseUrl}/checkout?error=tabby_failed${token ? `&token=${token}` : ""}`,
      },
      meta: {
        order_id: referenceId,
        customer: customer.email || "",
        token:    token || "",
        region:   countryCode,
      },
    };

    const apiKey =
      region.currency === "AED"
        ? process.env.TABBY_PUBLIC_API_KEY_AED
        : region.currency === "SAR"
          ? process.env.TABBY_PUBLIC_API_KEY_SAR
          : process.env.TABBY_PUBLIC_API_KEY_KWD;

    console.log("[Tabby] Calling API:", {
      url:            `${region.apiBase}/api/v2/checkout`,
      currency:       region.currency,
      apiKeyPrefix:   apiKey?.slice(0, 15),
      merchantCode,
      totalDisplay:   totalDisplay.toFixed(2),
      countryCode,
    });

    const res = await fetch(`${region.apiBase}/api/v2/checkout`, {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("[Tabby] Session creation failed:", res.status, res.statusText, errorText);
      return NextResponse.json(
        { error: "Tabby session failed", detail: errorText },
        { status: 502, headers: CORS_HEADERS },
      );
    }

    const data = await res.json();

    const product = data.configuration?.available_products?.installments?.[0];
    if (!product?.web_url) {
      console.error("[Tabby] No installments product available:", JSON.stringify(data));
      return NextResponse.json(
        {
          error:
            "Tabby pay-in-4 is not available for this order. This may be due to the order amount, region, or buyer history.",
        },
        { status: 422, headers: CORS_HEADERS },
      );
    }

    // Store AED values in Redis — webhook uses these to create Shopify order
    await redis.set(
      `tabby_checkout:${referenceId}`,
      JSON.stringify({
        items,           // ← AED prices
        customer,
        currency:        "AED",   // ← always AED for Shopify
        shipping,        // ← AED
        shippingHandle,
        discountAmount,  // ← AED
        discountCode,
        token:           token || "",
      }),
      { ex: 60 * 60 * 24 },
    );

    return NextResponse.json(
      { url: product.web_url, referenceId },
      { headers: CORS_HEADERS },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Tabby checkout failed";
    console.error("[Tabby] Error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}