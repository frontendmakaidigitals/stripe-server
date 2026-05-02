import { NextRequest, NextResponse } from "next/server";
import { verifyCheckoutToken } from "@/app/lib/checkout-token";
import { markTokenUsed } from "@/app/lib/used-tokens";
import type { CartItem, CustomerInfo } from "@/types/checkout.types";
export const runtime = "nodejs";

async function createShopifyOrder(
  items: CartItem[],
  customer: CustomerInfo,
  currency: string,
  paymentId: string,
): Promise<string> {
  const domain = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
  const token  = process.env.SHOPIFY_ACCESS_TOKEN!;

  const [firstName, ...rest] = (customer.name || "Guest").trim().split(" ");
  const lastName = rest.join(" ") || "-";

  const address = {
    first_name: firstName,
    last_name:  lastName,
    address1:   customer.address || "",
    city:       customer.city    || "",
    country:    customer.country || "AE",
    phone:      customer.phone   || "",
  };

  const lineItems = items.map((item) =>
    item.variant_id
      ? { variant_id: parseInt(item.variant_id, 10), quantity: item.quantity }
      : {
          title:             item.product_title,
          price:             item.price.toFixed(2),  // ✅ already decimal, no /100
          quantity:          item.quantity,
          requires_shipping: true,
          taxable:           false,
        },
  );

  const draftRes = await fetch(
    `https://${domain}/admin/api/2024-01/draft_orders.json`,
    {
      method:  "POST",
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
          note:             `Paid via Tamara. Session: ${paymentId}`,
          tags:             "Tamara, custom-checkout",
          send_receipt:     true,
        },
      }),
    },
  );

  if (!draftRes.ok) {
    throw new Error(`Shopify draft order error: ${await draftRes.text()}`);
  }

  const { draft_order: draft } = await draftRes.json();

  const completeRes = await fetch(
    `https://${domain}/admin/api/2024-01/draft_orders/${draft.id}/complete.json?payment_pending=false`,
    {
      method:  "PUT",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type":           "application/json",
      },
    },
  );

  if (!completeRes.ok) {
    console.warn("Shopify order completion failed for draft:", draft.id);
    return draft.name;
  }

  const { draft_order: completed } = await completeRes.json();
  return completed.name;
}

export async function POST(request: NextRequest) {
  // Verify the request is genuinely from Tamara
  const notificationToken = request.headers.get("Notification-Token");
  if (notificationToken !== process.env.TAMARA_NOTIFICATION_TOKEN) {
    console.warn("[Tamara webhook] Invalid notification token");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  if (body.event_type !== "order_approved") {
    return NextResponse.json({ received: true });
  }

  const token = body.metadata?.token;
  if (token) {
    try {
      const payload = await verifyCheckoutToken(token);
      await createShopifyOrder(payload.items, payload.customer, "AED", body.order_id);
      markTokenUsed(token);
    } catch (err) {
      console.error("[Tamara webhook] Failed:", err);
    }
  }

  return NextResponse.json({ received: true });
}