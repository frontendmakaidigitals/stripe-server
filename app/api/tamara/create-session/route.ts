import { NextRequest, NextResponse } from "next/server";
import type { CartItem, CustomerInfo } from "@/types/checkout.types";
import redis from "@/app/lib/redis";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  console.log("[Tamara checkout] HIT");

  try {
    const {
      items,
      customer,
      currency = "AED",
      token,
      shipping = 0,
      shippingHandle = "Shipping",
      discountAmount = 0,
      discountCode,
      cancelUrl,
    } = (await request.json()) as {
      items: CartItem[];
      customer: CustomerInfo;
      currency?: string;
      token?: string;
      shipping?: number;
      shippingHandle?: string;
      discountAmount?: number;
      discountCode?: string;
      cancelUrl?: string;
    };

    console.log("[Tamara checkout] Parsed body — items:", items?.length, "customer:", customer?.email, "currency:", currency, "shipping:", shipping, "discountAmount:", discountAmount, "discountCode:", discountCode);

    if (!items?.length) {
      console.warn("[Tamara checkout] No items — aborting");
      return NextResponse.json(
        { error: "No items" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const baseUrl      = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";
    const referenceId  = `order_${Date.now()}`;
    const itemTotal    = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const grandTotal   = Math.max(0, itemTotal + shipping - discountAmount);

    console.log(`[Tamara checkout] referenceId=${referenceId} itemTotal=${itemTotal} grandTotal=${grandTotal}`);

    const toAmount = (val: number) => ({
      amount:   parseFloat(val.toFixed(2)),
      currency: currency.toUpperCase(),
    });

    const [firstName, ...rest] = (customer.name || "Guest").trim().split(" ");
    const lastName = rest.join(" ") || "-";

    const payload = {
      order_reference_id: referenceId,
      total_amount:       toAmount(grandTotal),
      shipping_amount:    toAmount(shipping),
      tax_amount:         toAmount(0),
      discount: {
        amount: toAmount(discountAmount),
        name:   discountCode || "",
      },
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
        image_url:       item.image || "",
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
    };

    console.log("[Tamara checkout] Sending session payload to Tamara API:", process.env.TAMARA_API_URL);

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
      console.error("[Tamara checkout] Session creation failed — status:", res.status, "body:", error);
      return NextResponse.json(
        { error: "Tamara session failed", detail: error },
        { status: 502, headers: CORS_HEADERS },
      );
    }

    const data = await res.json();
    console.log("[Tamara checkout] Tamara response — order_id:", data.order_id, "checkout_id:", data.checkout_id, "status:", data.status);

    if (!data.checkout_url) {
      console.error("[Tamara checkout] No checkout_url in Tamara response:", data);
      return NextResponse.json(
        { error: "No checkout URL from Tamara" },
        { status: 422, headers: CORS_HEADERS },
      );
    }

    console.log("[Tamara checkout] Storing Redis key tamara_checkout +  tamara_display for referenceId:", referenceId);

    await redis.set(
      `tamara_display:${referenceId}`,
      JSON.stringify({
        items,
        itemsDisplay: items,
        customer,
        currency,
        shipping,
        shippingDisplay: shipping,
        shippingHandle,
        discountAmount,
        discountDisplay: discountAmount,
        discountCode,
        email: customer.email,
      }),
      "EX", 60 * 60 * 24,
    );

    console.log(`[Tamara checkout] ✅ Done — referenceId=${referenceId} tamaraOrderId=${data.order_id} checkout_url=${data.checkout_url}`);

    return NextResponse.json(
      { url: data.checkout_url, referenceId },
      { headers: CORS_HEADERS },
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Tamara checkout failed";
    console.error("[Tamara checkout] Unhandled error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}