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
  currency: string,
  stripeSessionId: string,
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
          note:             `Paid via Stripe. Session: ${stripeSessionId}`,
          tags:             "Stripe, custom-checkout",
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

async function handleSuccessfulPayment(session: Stripe.Checkout.Session) {
  const meta     = session.metadata ?? {};
  const token    = meta.token;
  const currency = meta.currency || "AED";

  let customer: CustomerInfo;
  let items: CartItem[];

  if (token) {
    // ✅ Primary path — verify token to get full order data
    try {
      const payload = await verifyCheckoutToken(token);
      customer = payload.customer;
      items    = payload.items;
    } catch (err) {
      console.error("Could not verify checkout token:", err);
      return;
    }
  } else {
    // Fallback for any old sessions
    try {
      customer = JSON.parse(meta.customer || "{}");
      items    = JSON.parse(meta.items    || "[]");
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
    const orderName = await createShopifyOrder(items, customer, currency, session.id);
    console.log(`✅ Shopify order ${orderName} created for Stripe session ${session.id}`);
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
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
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
    console.error("Webhook fulfillment error:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ received: true });
}