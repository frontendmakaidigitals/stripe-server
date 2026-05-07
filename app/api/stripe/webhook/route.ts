import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import type { CartItem, CustomerInfo } from "@/types/checkout.types";

import { verifyCheckoutToken } from "@/app/lib/checkout-token";
import { markTokenUsed } from "@/app/lib/used-tokens";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia",
});

async function getRawBody(request: NextRequest): Promise<Buffer> {
  return Buffer.from(await request.arrayBuffer());
}

async function createShopifyOrder(
  items: CartItem[],
  customer: CustomerInfo,
  stripeSessionId: string,
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

  // All prices are AED (pre-converted by the frontend before being stored in
  // metadata / the checkout token). taxes_included: true so Shopify back-
  // calculates VAT correctly — identical to the COD flow.
  const lineItems: object[] = items.map((item) => ({
    title:             item.product_title,
    sku:               item.sku || item.variant_id || "",
    price:             item.price.toFixed(2),   // AED, VAT-inclusive
    quantity:          item.quantity,
    requires_shipping: true,
    taxable:           true,                    // ✅ back-calculate VAT from inclusive price
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
          line_items:     lineItems,
          email:          customer.email,
          shipping_address: address,
          billing_address:  address,
          tax_exempt:     !isUAE,
          taxes_included: true,                 // ✅ prices are VAT-inclusive
          note:           `Paid via Stripe. Session: ${stripeSessionId}`,
          tags:           "Stripe, custom-checkout",
          send_receipt:   true,

          ...(shipping > 0 && {
            shipping_line: {
              title:   shippingHandle,
              price:   shipping.toFixed(2),     // AED, VAT-inclusive
              taxable: true,
            },
          }),

          // Mirror COD discount structure exactly
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
    throw new Error(`Shopify draft order error: ${await draftRes.text()}`);
  }

  const draftJson = await draftRes.json();

  console.log("[Stripe webhook] Shopify draft order totals:", {
    total_price:      draftJson.draft_order?.total_price,
    subtotal_price:   draftJson.draft_order?.subtotal_price,
    total_tax:        draftJson.draft_order?.total_tax,
    taxes_included:   draftJson.draft_order?.taxes_included,
    applied_discount: draftJson.draft_order?.applied_discount,
    line_items: draftJson.draft_order?.line_items?.map((l: any) => ({
      title:     l.title,
      price:     l.price,
      taxable:   l.taxable,
      tax_lines: l.tax_lines,
    })),
  });

  const draft = draftJson.draft_order;

  // payment_pending=false because Stripe already captured the payment
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

async function handleSuccessfulPayment(session: Stripe.Checkout.Session) {
  const meta           = session.metadata ?? {};
  const token          = meta.token;
  // All monetary metadata is stored in AED (set by create-checkout)
  const aedToBase      = parseFloat(meta.aedToBase      || "1");
  const shipping       = parseFloat(meta.shipping       || "0");   // AED
  const shippingHandle = meta.shippingHandle || "Shipping";
  const discountCode   = meta.discountCode   || undefined;
  const discountAmount = parseFloat(meta.discountAmount || "0");   // AED

  let customer: CustomerInfo;
  let items: CartItem[];

  if (token) {
  try {
    const payload = await verifyCheckoutToken(token);
    customer = payload.customer;
    items    = payload.items ?? [];
    console.log(`[Webhook] Token verified. Items: ${items.length}, Customer: ${payload.customer?.email}`);
  } catch (err) {
    console.error("Could not verify checkout token:", err);
    return;
  }
} else {
    try {
      const rawItems: CartItem[] = JSON.parse(meta.items || "[]");
      customer = JSON.parse(meta.customer || "{}");
      // Same conversion for the fallback metadata path
      items = rawItems.map((item) => ({
        ...item,
        price: aedToBase > 0 ? item.price / aedToBase : item.price,
      }));
    } catch {
      console.error("Could not parse metadata from Stripe session:", session.id);
      return;
    }
  }

  if (!items.length) {
    console.warn("No items found. Skipping Shopify order.");
    return;
  }

  try {
    const orderName = await createShopifyOrder(
      items,
      customer,
      session.id,
      shipping,
      shippingHandle,
      discountAmount,
      discountCode,
    );
    console.log(
      `✅ Shopify order ${orderName} created for Stripe session ${session.id}`,
      shipping > 0       ? `shipping=${shipping.toFixed(2)} AED`       : "",
      discountAmount > 0 ? `discount=${discountAmount.toFixed(2)} AED` : "",
    );
    if (token) markTokenUsed(token);
  } catch (err) {
    console.error("Failed to create Shopify order after Stripe payment:", err);
  }
}

async function handlePaymentFailed(session: Stripe.Checkout.Session) {
  console.warn("❌ Payment failed:", {
    sessionId:     session.id,
    customerEmail: session.customer_email,
  });
}

export async function POST(request: NextRequest) {
  const rawBody = await getRawBody(request);
  const sig     = request.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Signature mismatch";
    console.error("Webhook signature verification failed:", msg);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status === "paid") await handleSuccessfulPayment(session);
        break;
      }
      case "checkout.session.async_payment_succeeded": {
        await handleSuccessfulPayment(event.data.object as Stripe.Checkout.Session);
        break;
      }
      case "checkout.session.async_payment_failed":
      case "payment_intent.payment_failed": {
        await handlePaymentFailed(event.data.object as Stripe.Checkout.Session);
        break;
      }
      default:
        console.log("Unhandled Stripe event:", event.type);
    }
  } catch (err: unknown) {
    console.error(
      "Webhook fulfillment error:",
      err instanceof Error ? err.message : err,
    );
  }

  return NextResponse.json({ received: true });
}