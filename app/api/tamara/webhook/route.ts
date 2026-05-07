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
  shipping: number = 0,
  shippingHandle: string = "Shipping",
  discountAmount: number = 0,
  discountCode?: string,
): Promise<string> {
  const domain = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
  const token  = process.env.SHOPIFY_ACCESS_TOKEN!;

  const [firstName, ...rest] = (customer.name || "Guest").trim().split(" ");
  const lastName = rest.join(" ") || "-";

  const isUAE =
    customer.country?.trim().toLowerCase() === "united arab emirates" ||
    customer.country?.trim().toUpperCase() === "AE";

  const address = {
    first_name: firstName,
    last_name:  lastName,
    address1:   customer.address  || "",
    address2:   customer.address2 || "",
    city:       customer.city     || "",
    province:   customer.province || "",
    zip:        customer.zip      || "",
    country:    customer.country  || "AE",
    phone:      customer.phone    || "",
  };

  // Don't use variant_id — Shopify overrides price when variant_id present
  const lineItems: object[] = items.map((item) => ({
    title:             item.product_title,
    sku:               item.sku || item.variant_id || "",
    price:             item.price.toFixed(2),
    quantity:          item.quantity,
    requires_shipping: true,
    taxable:           isUAE,
  }));

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
          tax_exempt:       !isUAE,
          note:             `Paid via Tamara. Order ID: ${paymentId}`,
          tags:             "Tamara, custom-checkout",
          send_receipt:     true,
          ...(shipping > 0 && {
            shipping_line: {
              title: shippingHandle,
              price: shipping.toFixed(2),
            },
          }),
          ...(discountCode && discountAmount > 0 && {
            applied_discount: {
              title:       discountCode,
              value:       discountAmount.toFixed(2),
              value_type:  "fixed_amount",
              description: `Discount code: ${discountCode}`,
            },
          }),
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
    console.warn("[Tamara webhook] Shopify completion failed for draft:", draft.id);
    return draft.name;
  }

  const { draft_order: completed } = await completeRes.json();
  return completed.name;
}

export async function POST(request: NextRequest) {
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

      // Read from JWT payload first, fall back to Tamara metadata
      const shipping       = payload.shipping       ?? parseFloat(body.metadata?.shipping       || "0");
      const shippingHandle = payload.shippingHandle ?? body.metadata?.shippingHandle             ?? "Shipping";
      const discountAmount = payload.discountAmount ?? parseFloat(body.metadata?.discountAmount  || "0");
      const discountCode   = payload.discountCode   ?? (body.metadata?.discountCode || undefined);

      await createShopifyOrder(
        payload.items,
        payload.customer,
        payload.currency || "AED",
        body.order_id,
        shipping,
        shippingHandle,
        discountAmount,
        discountCode,
      );
      markTokenUsed(token);
    } catch (err) {
      console.error("[Tamara webhook] Failed:", err);
    }
  }

  return NextResponse.json({ received: true });
}