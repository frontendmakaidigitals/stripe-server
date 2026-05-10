// app/api/order/success/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const provider    = searchParams.get("provider");
  const referenceId = searchParams.get("referenceId");
  const sessionId   = searchParams.get("session_id");

  try {
    if (provider === "stripe" && sessionId) {
      const stripe = new (await import("stripe")).default(
        process.env.STRIPE_SECRET_KEY!,
        { apiVersion: "2026-04-22.dahlia" }
      );
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["line_items"],
      });
      return NextResponse.json({
        orderId:  session.metadata?.order_id || sessionId,
        email:    session.customer_email,
        provider: "stripe",
        items:    session.line_items?.data,
      });
    }

    if ((provider === "tabby" || provider === "tamara") && referenceId) {
      const key  = `${provider}_checkout:${referenceId}`;
      const data = await redis.get<any>(key);
      if (!data) return NextResponse.json({ error: "Order not found" }, { status: 404 });
      return NextResponse.json({ ...data, provider });
    }

    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 });
  }
}