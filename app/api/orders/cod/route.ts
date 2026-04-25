// app/api/orders/cod/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Creates a real Shopify order for Cash on Delivery.
// Uses Draft Orders API → complete with payment_pending=true.
// Inventory is deducted and fulfillment is triggered in Shopify.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import type { CartItem, CustomerInfo } from "@/app/lib/checkout-token";

interface CODRequest {
  items: CartItem[];
  currency: string;
  customer: CustomerInfo;
}

// ─── Create Shopify order ─────────────────────────────────────────────────────

async function createShopifyOrder(
  items: CartItem[],
  customer: CustomerInfo,
  currency: string,
) {
  const domain = process.env.SHOPIFY_STORE_DOMAIN!;   // "yourstore.myshopify.com"
  const token  = process.env.SHOPIFY_ADMIN_TOKEN!;    // shpat_xxx

  const [firstName, ...rest] = customer.name.trim().split(" ");
  const lastName = rest.join(" ") || "-";

  const address = {
    first_name: firstName,
    last_name:  lastName,
    address1:   customer.address,
    city:       customer.city,
    country:    customer.country || "AE",
    phone:      customer.phone,
  };

  // Build line items — use variant_id if present (links to real Shopify product)
  const lineItems = items.map((item) =>
    item.variant_id
      ? { variant_id: parseInt(item.variant_id, 10), quantity: item.quantity }
      : {
          title:              item.product_title,
          price:              (item.price / 100).toFixed(2),
          quantity:           item.quantity,
          requires_shipping:  true,
          taxable:            false,
        },
  );

  // Step 1: Create draft order
  const draftRes = await fetch(
    `https://${domain}/admin/api/2024-01/draft_orders.json`,
    {
      method:  "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type":          "application/json",
      },
      body: JSON.stringify({
        draft_order: {
          line_items:       lineItems,
          email:            customer.email,
          shipping_address: address,
          billing_address:  address,
          note:             `COD order — phone: ${customer.phone}`,
          tags:             "COD, custom-checkout",
          // Don't let Shopify auto-send its own checkout URL to customer
          send_receipt: false,
        },
      }),
    },
  );

  if (!draftRes.ok) {
    const err = await draftRes.text();
    console.error("Shopify draft order error:", err);
    throw new Error(`Shopify error: ${draftRes.status}`);
  }

  const { draft_order: draft } = await draftRes.json();

  // Step 2: Complete draft → real order with payment_pending=true
  // This deducts inventory and makes it visible in Shopify fulfillment
  const completeRes = await fetch(
    `https://${domain}/admin/api/2024-01/draft_orders/${draft.id}/complete.json?payment_pending=true`,
    {
      method:  "PUT",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type":          "application/json",
      },
    },
  );

  if (!completeRes.ok) {
    // Draft was created but not completed — log it, don't fail the customer
    console.warn("Draft order created but completion failed. Draft ID:", draft.id);
    return { orderId: draft.name, numericId: draft.id };
  }

  const { draft_order: completed } = await completeRes.json();

  console.log(
    `✅ COD order created: ${completed.name}`,
    `customer=${customer.email}`,
    `total=${completed.total_price} ${currency}`,
  );

  return { orderId: completed.name, numericId: completed.id };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body: CODRequest = await request.json();
    const { items, currency = "AED", customer } = body;

    // Validate
    if (!items?.length) {
      return NextResponse.json({ error: "No items in cart" }, { status: 400 });
    }
    if (!customer?.name || !customer?.email || !customer?.phone || !customer?.address || !customer?.city) {
      return NextResponse.json({ error: "Missing customer details" }, { status: 400 });
    }

    const result = await createShopifyOrder(items, customer, currency);

    return NextResponse.json({
      success:  true,
      orderId:  result.orderId,    // e.g. "#1042" — shown to customer
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Order creation failed";
    console.error("COD order error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}