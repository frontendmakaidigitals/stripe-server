import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import type { CartItem, CustomerInfo } from "@/types/checkout.types";
import redis from "@/app/lib/redis";

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

  const lineItems: object[] = items.map((item) => ({
    title:             item.product_title,
    sku:               item.sku || item.variant_id || "",
    price:             item.price.toFixed(2),
    quantity:          item.quantity,
    requires_shipping: true,
    taxable:           true,
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
          taxes_included:   true,
          note:             `Paid via Stripe. Session: ${stripeSessionId}`,
          tags:             "Stripe, custom-checkout",
          send_receipt:     true,

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

  // ✅ Fix: fetch the real Shopify order instead of returning draft name
  if (!completed.order_id) {
    console.warn("[Stripe webhook] No order_id after completion. Draft:", completed.name);
    return completed.name;
  }

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
    console.warn("[Stripe webhook] Could not fetch real order, falling back");
    return `#${completed.order_id}`;
  }

  const { order } = await orderRes.json();
  console.log(`[Stripe webhook] Real order: ${order.name} (${order.id})`);
  return order.name;
}

async function handleSuccessfulPayment(session: Stripe.Checkout.Session) {
  const meta           = session.metadata ?? {};
  const aedToBase      = parseFloat(meta.aedToBase   || "1") || 1;
  const shipping       = parseFloat(meta.shippingAED || "0");
  const shippingHandle = meta.shippingHandle || "Shipping";
  const discountCode   = meta.discountCode   || undefined;
  const discountAmount = parseFloat(meta.discountAmountAED || "0");

  console.log(`[Webhook] Expanding session ${session.id}...`);
  let expanded: Stripe.Checkout.Session;
  try {
    expanded = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ["line_items.data.price.product"],
    });
  } catch (err) {
    console.error("[Webhook] Could not expand Stripe session:", err);
    return;
  }

  const [
    custName     = "",
    custEmail    = "",
    custPhone    = "",
    custAddress  = "",
    custAddress2 = "",
    custCity     = "",
    custProvince = "",
    custZip      = "",
    custCountry  = "AE",
  ] = (meta.cust || "").split("|");

  const countryCode = custCountry || "AE";
  const customer: CustomerInfo = {
    id:          "",
    name:        custName  || "Guest",
    email:       custEmail || session.customer_email || "",
    phone:       custPhone,
    address:     custAddress,
    address2:    custAddress2,
    city:        custCity,
    province:    custProvince,
    zip:         custZip,
    country:     countryCode,
    countryCode,
    addresses:   [],
  };

  const shippingLabel = (shippingHandle || "shipping").toLowerCase();

  // AED items for Shopify order creation
  const items: CartItem[] = (expanded.line_items?.data ?? [])
    .filter((li) => {
      const name = (li.description ?? "").toLowerCase();
      const sku  = (li.price?.product as Stripe.Product)?.metadata?.sku ?? "";
      return name !== shippingLabel && sku !== "__shipping__";
    })
    .map((li) => {
      const product = li.price?.product as Stripe.Product | undefined;
      return {
        product_title: li.description ?? "Product",
        sku:           product?.metadata?.sku        || "",
        variant_id:    product?.metadata?.variant_id || "",
        price:         (li.price?.unit_amount ?? 0) / 100 / aedToBase, // convert to AED
        quantity:      li.quantity ?? 1,
        image:         product?.images?.[0] || "",
      };
    });

  // Display currency items for success page
  const displayItems = (expanded.line_items?.data ?? [])
    .filter((li) => {
      const sku = (li.price?.product as Stripe.Product)?.metadata?.sku ?? "";
      return sku !== "__shipping__";
    })
    .map((li) => {
      const product = li.price?.product as Stripe.Product | undefined;
      return {
        product_title: li.description ?? "Product",
        sku:           product?.metadata?.sku        || "",
        variant_id:    product?.metadata?.variant_id || "",
        price:         (li.price?.unit_amount ?? 0) / 100, // display currency
        quantity:      li.quantity ?? 1,
        image:         product?.images?.[0] || "",
      };
    });

  console.log(
    `[Webhook] Items: ${items.length}, Customer: ${customer.email}, aedToBase: ${aedToBase}`,
  );

  if (!items.length) {
    console.error("[Webhook] ❌ No items after expanding session:", session.id);
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

    console.log(`✅ Shopify order ${orderName} created for Stripe session ${session.id}`);

    // Store for success page
  await redis.set(
  `stripe_order:${session.id}`,
  JSON.stringify({
    orderId:        orderName,
    email:          customer.email,
    currency:       session.currency?.toUpperCase() ?? "AED",
    items:          displayItems,
    // ✅ display currency values — divide AED by aedToBase to get display currency
    shipping:       shipping / aedToBase,
    discountAmount: parseFloat(meta.discountAmountDisplay || "0") ||
                discountAmount / aedToBase,
    discountCode:   meta.discountCode   || "",
    shippingHandle: meta.shippingHandle || "",
    customer,
  }),
  "EX", 60 * 60 * 24,
);

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