import { markTokenUsed } from "@/app/lib/used-tokens";
import { NextRequest, NextResponse } from "next/server";
import type { CartItem, CustomerInfo } from "@/types/checkout.types";

interface CODRequest {
  items: CartItem[];
  currency: string;
  customer: CustomerInfo;
  token?: string;
  shipping?: number;
  shippingHandle?: string;
  codFee?: number;
  discountCode?: string;
  discountAmount?: number;
  discountType?: string | null;
}

async function createShopifyOrder(
  items: CartItem[],
  customer: CustomerInfo,
  currency: string,
  codFee: number = 0,
  discountCode?: string,
  discountAmount: number = 0,
  shipping: number = 0,
  shippingHandle: string = "Shipping",
) {
  const domain = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
  const token  = process.env.SHOPIFY_ACCESS_TOKEN!;

  const [firstName, ...rest] = customer.name.trim().split(" ");
  const lastName = rest.join(" ") || "-";

  const isUAE =
    customer.country?.trim().toLowerCase() === "united arab emirates" ||
    customer.country?.trim().toUpperCase() === "AE";

  const address = {
    first_name: firstName,
    last_name:  lastName,
    address1:   customer.address,
    address2:   customer.address2 || "",
    city:       customer.city,
    province:   customer.province || "",
    zip:        customer.zip      || "",
    country:    customer.country  || "AE",
    phone:      customer.phone,
  };

  const lineItems: object[] = items.map((item) => ({
    title:             item.product_title,
    sku:               item.sku || item.variant_id || "",
    price:             item.price.toFixed(2),
    quantity:          item.quantity,
    requires_shipping: true,
    taxable:           true,
  }));

  if (codFee > 0) {
    lineItems.push({
      title:             "COD Fee",
      price:             codFee.toFixed(2),
      quantity:          1,
      requires_shipping: false,
      taxable:           true,
    });
  }

  // ── Create draft order ────────────────────────────────────────────────────
  const draftRes = await fetch(
    `https://${domain}/admin/api/2024-01/draft_orders.json`,
    {
      method: "POST",
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
          note: `COD order — phone: ${customer.phone}${
            codFee > 0 ? ` | COD fee: ${codFee.toFixed(2)} ${currency}` : ""
          }`,
          tags:         "COD, custom-checkout",
          send_receipt: false,

          ...(shipping > 0 && {
            shipping_line: {
              title:   shippingHandle,
              price:   shipping.toFixed(2),
              taxable: true,
            },
          }),

          ...(discountCode && discountAmount > 0
            ? {
                applied_discount: {
                  value_type:  "fixed_amount",
                  value:       discountAmount.toFixed(2),
                  amount:      discountAmount.toFixed(2),
                  title:       discountCode,
                  description: `Discount code: ${discountCode}`,
                },
              }
            : discountCode
            ? {
                applied_discount: {
                  value_type:       "percentage",
                  value:            "0",
                  title:            discountCode,
                  description:      discountCode,
                  application_type: "discount_code",
                },
              }
            : {}),
        },
      }),
    },
  );

  if (!draftRes.ok) {
    const err = await draftRes.text();
    console.error("[COD] Shopify draft order error:", err);
    throw new Error(`Shopify error: ${draftRes.status}`);
  }

  const { draft_order: draft } = await draftRes.json();

  // ── Complete draft order ──────────────────────────────────────────────────
  const completeRes = await fetch(
    `https://${domain}/admin/api/2024-01/draft_orders/${draft.id}/complete.json?payment_pending=true`,
    {
      method: "PUT",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type":           "application/json",
      },
    },
  );

  if (!completeRes.ok) {
    console.warn("[COD] Draft created but completion failed. Draft ID:", draft.id);
    return { orderId: draft.name, numericId: draft.id };
  }

  const { draft_order: completed } = await completeRes.json();

  if (!completed.order_id) {
    console.warn("[COD] No order_id after completion. Draft:", completed.name);
    return { orderId: completed.name, numericId: completed.id };
  }

  // ── Fetch real order to get correct order name (#1001 format) ────────────
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
    console.warn("[COD] Could not fetch real order, falling back to order_id");
    return { orderId: `#${completed.order_id}`, numericId: completed.order_id };
  }

  const { order } = await orderRes.json();
  console.log(`[COD] Order created: ${order.name} (${order.id})`);
  return { orderId: order.name, numericId: order.id };
}

export async function POST(request: NextRequest) {
  try {
    const body: CODRequest = await request.json();
    const {
      items,
      currency       = "AED",
      customer,
      codFee         = 0,
      discountCode,
      discountAmount = 0,
      shipping       = 0,
      shippingHandle = "Shipping",
    } = body;

    if (!items?.length) {
      return NextResponse.json({ error: "No items in cart" }, { status: 400 });
    }

    if (
      !customer?.name    ||
      !customer?.email   ||
      !customer?.phone   ||
      !customer?.address ||
      !customer?.city
    ) {
      return NextResponse.json(
        { error: "Missing customer details" },
        { status: 400 },
      );
    }

    const result = await createShopifyOrder(
      items,
      customer,
      currency,
      codFee,
      discountCode,
      discountAmount,
      shipping,
      shippingHandle,
    );

    const token = request.headers.get("x-checkout-token") || body.token;
    if (token) markTokenUsed(token);

    return NextResponse.json({ success: true, orderId: result.orderId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Order creation failed";
    console.error("[COD] Order error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}