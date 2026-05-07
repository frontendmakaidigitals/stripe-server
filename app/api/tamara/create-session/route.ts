import { NextRequest, NextResponse } from "next/server";
import type { CartItem, CustomerInfo } from "@/types/checkout.types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const {
      items,
      customer,
      currency = "AED",
      token,
      shipping,
      shippingHandle = "Shipping", // ← add
      discountAmount = 0,          // ← add
      discountCode,                // ← add
      cancelUrl,
    } = await request.json() as {
      items: CartItem[];
      customer: CustomerInfo;
      currency?: string;
      token?: string;
      shipping?: number;
      shippingHandle?: string;  // ← add
      discountAmount?: number;  // ← add
      discountCode?: string;    // ← add
      cancelUrl?: string;
    };

    if (!items?.length) {
      return NextResponse.json(
        { error: "No items" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const baseUrl    = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";
    const itemTotal  = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const shipTotal  = shipping ?? 0;
    const grandTotal = itemTotal + shipTotal;

    const toAmount = (val: number) => ({
      amount:   parseFloat(val.toFixed(2)),
      currency: currency.toUpperCase(),
    });

    const [firstName, ...rest] = (customer.name || "Guest").trim().split(" ");
    const lastName = rest.join(" ") || "-";

    const payload = {
      order_reference_id: `order_${Date.now()}`,
      total_amount:       toAmount(grandTotal),
      shipping_amount:    toAmount(shipTotal),
      tax_amount:         toAmount(0),
      discount: {
        amount: toAmount(discountAmount), // ← use actual discount
        name:   discountCode || "",
      },
      items: items.map((item) => ({
        reference_id: item.variant_id || item.product_title,
        type:         "Physical",
        name:         item.product_title,
        sku:          item.variant_id || "",
        quantity:     item.quantity,
        unit_price:   toAmount(item.price),
        total_amount: toAmount(item.price * item.quantity),
        image_url:    item.image || "",
      })),
      consumer: {
        first_name:   firstName,
        last_name:    lastName,
        phone_number: customer.phone || "",
        email:        customer.email || "",
      },
      billing_address: {
        first_name:   firstName,
        last_name:    lastName,
        line1:        customer.address  || "",
        city:         customer.city     || "",
        country_code: customer.country  || "AE",
        phone_number: customer.phone    || "",
      },
      shipping_address: {
        first_name:   firstName,
        last_name:    lastName,
        line1:        customer.address  || "",
        city:         customer.city     || "",
        country_code: customer.country  || "AE",
        phone_number: customer.phone    || "",
      },
      merchant_url: {
        success:      `${baseUrl}/success?provider=tamara`,
        failure:      `${baseUrl}/checkout?error=tamara_failed${token ? `&token=${token}` : ""}`,
        cancel:       cancelUrl ?? `${baseUrl}/checkout${token ? `?token=${token}` : ""}`,
        notification: `${baseUrl}/api/tamara/webhook`,
      },
      description:  "Order from store",
      country_code: customer.country || "AE",
      payment_type: "PAY_BY_INSTALMENTS",
      instalments:  4,
      locale:       "en_US",
      metadata: {
        token:          token          || "",
        customer:       customer.email || "",
        shipping:       shipTotal.toFixed(2),              // ← add for webhook
        shippingHandle: shippingHandle,                    // ← add for webhook
        discountAmount: discountAmount.toFixed(2),         // ← add for webhook
        discountCode:   discountCode   || "",              // ← add for webhook
      },
    };

    const res = await fetch(`${process.env.TAMARA_API_URL}/checkout`, {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${process.env.TAMARA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error("[Tamara] Session creation failed:", error);
      return NextResponse.json(
        { error: "Tamara session failed" },
        { status: 502, headers: CORS_HEADERS },
      );
    }

    const data = await res.json();

    if (!data.checkout_url) {
      return NextResponse.json(
        { error: "No checkout URL from Tamara" },
        { status: 422, headers: CORS_HEADERS },
      );
    }

    return NextResponse.json(
      { url: data.checkout_url },
      { headers: CORS_HEADERS },
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Tamara checkout failed";
    console.error("[Tamara] Error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}