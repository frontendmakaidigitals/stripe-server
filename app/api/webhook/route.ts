import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

// bodyParser must be disabled — Stripe signature verification requires the raw body
export const config = {
  api: { bodyParser: false },
};

// ─── Stripe singleton ─────────────────────────────────────────────────────────
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia",
});

// ─── Raw body helper ──────────────────────────────────────────────────────────
async function getRawBody(request: NextRequest): Promise<Buffer> {
  const arrayBuffer = await request.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── Fulfillment logic ────────────────────────────────────────────────────────
// Replace the body of this function with your real business logic:
// send confirmation emails, update your DB, notify Shopify, etc.
async function handleSuccessfulPayment(session: Stripe.Checkout.Session) {
  const {
    customerName,
    customerEmail,
    packageId,
    packageName,
    originalPrice,
    discountApplied,
    finalPrice,
    couponCode,
  } = session.metadata ?? {};

  console.log("✅ Payment succeeded:", {
    sessionId: session.id,
    amountTotal: session.amount_total, // cents — use this as the canonical amount
    customerName,
    customerEmail,
    packageId,
    packageName,
    originalPrice,
    discountApplied,
    finalPrice,
    couponCode: couponCode || "(none)",
  });

  // ── Example: notify Shopify via Orders API ────────────────────────────────
  //
  // await fetch("https://yourstore.myshopify.com/admin/api/2024-01/orders.json", {
  //   method: "POST",
  //   headers: {
  //     "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN!,
  //     "Content-Type": "application/json",
  //   },
  //   body: JSON.stringify({
  //     order: {
  //       financial_status: "paid",
  //       send_receipt: true,
  //       email: customerEmail,
  //       note: `Stripe session: ${session.id} | Package: ${packageId}`,
  //       line_items: [
  //         {
  //           title:    packageName,
  //           price:    finalPrice,
  //           quantity: 1,
  //         },
  //       ],
  //     },
  //   }),
  // });

  // ── Example: send confirmation email (e.g. via Resend / SendGrid) ─────────
  //
  // await sendEmail({
  //   to: customerEmail,
  //   subject: `Your ${packageName} purchase is confirmed`,
  //   body: `Hi ${customerName}, you've been charged $${finalPrice}. Session: ${session.id}`,
  // });

  // ── Example: mark coupon as used in your DB ───────────────────────────────
  //
  // if (couponCode) {
  //   await db.couponUsage.create({ couponCode, customerEmail, sessionId: session.id });
  // }
}

async function handlePaymentFailed(session: Stripe.Checkout.Session) {
  console.warn("❌ Payment failed:", {
    sessionId: session.id,
    customerEmail: session.customer_email,
    metadata: session.metadata,
  });

  // ── Example: send failure notification email ───────────────────────────────
  //
  // await sendEmail({
  //   to: session.customer_email ?? "",
  //   subject: "Your payment could not be processed",
  //   body: "Please try again or contact support.",
  // });
}

// ─── Webhook route handler ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  console.log("⚡️ Stripe webhook triggered");

  // 1. Read the raw body BEFORE doing anything else
  //    Stripe's signature check requires the exact bytes that were sent
  const rawBody = await getRawBody(request);

  // 2. Extract and validate the Stripe-Signature header
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    console.error("Missing Stripe-Signature header");
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  // 3. Verify the webhook signature
  //    This guarantees the request genuinely came from Stripe, not a spoofed call
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Signature mismatch";
    console.error("Webhook signature verification failed:", message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // 4. Dispatch on event type
  //    Stripe can deliver events more than once — make all handlers idempotent
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // payment_status === "paid" covers synchronous card payments.
        // For async methods (bank transfers, etc.) it will be "unpaid" here
        // and you'll receive a checkout.session.async_payment_succeeded later.
        if (session.payment_status === "paid") {
          await handleSuccessfulPayment(session);
        }
        break;
      }

      case "checkout.session.async_payment_succeeded": {
        // Fired for async payment methods (SEPA, ACH, etc.) after funds clear
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
        // Silently ignore event types you don't handle
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err: unknown) {
    // Log fulfillment errors but always return 200 to prevent Stripe from retrying
    // a webhook whose delivery succeeded (signature was valid) but fulfillment failed.
    // Handle retry logic inside your own fulfillment code.
    const message = err instanceof Error ? err.message : "Fulfillment error";
    console.error("Fulfillment error:", message);
  }

  // 5. Always return 200 once the signature check passes
  //    A non-200 response tells Stripe to retry the webhook
  return NextResponse.json({ received: true });
}
