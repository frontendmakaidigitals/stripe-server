// app/api/stripe/webhook/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Listens for Stripe payment events.
// On successful payment → creates a real Shopify order (inventory deducted).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import type { CustomerInfo, CartItem } from "@/app/lib/checkout-token";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia",
});

// ─── Raw body ─────────────────────────────────────────────────────────────────

async function getRawBody(request: NextRequest): Promise<Buffer> {
  return Buffer.from(await request.arrayBuffer());
}

// ─── Shopify order creation ───────────────────────────────────────────────────

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
          price:             (item.price / 100).toFixed(2),
          quantity:          item.quantity,
          requires_shipping: true,
          taxable:           false,
        },
  );

  // Create draft order
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
          note:             `Paid via Stripe. Session: ${stripeSessionId}`,
          tags:             "Stripe, custom-checkout",
          send_receipt:     true,  // Shopify sends confirmation email
        },
      }),
    },
  );

  if (!draftRes.ok) {
    throw new Error(`Shopify draft order error: ${await draftRes.text()}`);
  }

  const { draft_order: draft } = await draftRes.json();

  // Complete the draft — marks as paid, deducts inventory, triggers fulfillment
  const completeRes = await fetch(
    `https://${domain}/admin/api/2024-01/draft_orders/${draft.id}/complete.json?payment_pending=false`,
    {
      method:  "PUT",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type":          "application/json",
      },
    },
  );

  if (!completeRes.ok) {
    console.warn("Shopify order completion failed for draft:", draft.id);
    return draft.name;
  }

  const { draft_order: completed } = await completeRes.json();
  return completed.name; // e.g. "#1043"
}

// ─── Fulfillment handler ──────────────────────────────────────────────────────

async function handleSuccessfulPayment(session: Stripe.Checkout.Session) {
  const meta = session.metadata ?? {};

  // Parse customer and items stored in Stripe session metadata
  // (your create-checkout route must store these — see note below)
  let customer: CustomerInfo;
  let items: CartItem[];

  try {
    customer = JSON.parse(meta.customer || "{}");
    items    = JSON.parse(meta.items    || "[]");
  } catch {
    console.error("Could not parse metadata from Stripe session:", session.id);
    return;
  }

  if (!items.length) {
    console.warn("No items in Stripe session metadata. Skipping Shopify order.");
    return;
  }

  const currency = meta.currency || "AED";

  try {
    const orderName = await createShopifyOrder(items, customer, currency, session.id);
    console.log(`✅ Shopify order ${orderName} created for Stripe session ${session.id}`);
  } catch (err) {
    // Log but don't re-throw — payment already succeeded, don't panic
    console.error("Failed to create Shopify order after Stripe payment:", err);
    // TODO: push to a dead-letter queue or alert so you can create it manually
  }
}

async function handlePaymentFailed(session: Stripe.Checkout.Session) {
  console.warn("❌ Payment failed:", {
    sessionId:     session.id,
    customerEmail: session.customer_email,
  });
  // Optionally: send a "payment failed" email to the customer
}

// ─── Webhook route ────────────────────────────────────────────────────────────

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
        if (session.payment_status === "paid") {
          await handleSuccessfulPayment(session);
        }
        break;
      }
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleSuccessfulPayment(session);
        break;
      }
      case "checkout.session.async_payment_failed":
      case "payment_intent.payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handlePaymentFailed(session);
        break;
      }
      default:
        console.log("Unhandled Stripe event:", event.type);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Fulfillment error";
    console.error("Webhook fulfillment error:", msg);
    // Always return 200 after signature passes — prevents Stripe retrying
  }

  return NextResponse.json({ received: true });
}