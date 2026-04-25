import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
const PACKAGES: Record<string, { priceId: string; name: string }> = {
  "dog-food": { priceId: "price_1TPit7235n3eBgYvd7Oi0vlA", name: "Dog Food" },
  "cat-food": { priceId: "price_1TPiP5235n3eBgYvgTHOesdy", name: "Cat Food" },
  perfume: { priceId: "price_1TPiOH235n3eBgYvoly8K2Pa", name: "Perfume" },
};

export async function POST(request: NextRequest) {
  try {
    const { email, name, packageId } = await request.json();

    if (!email || !name || !packageId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const pkg = PACKAGES[packageId];
    if (!pkg) {
      return NextResponse.json({ error: "Invalid package" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [{ price: pkg.priceId, quantity: 1 }],
      allow_promotion_codes: true, // ← Stripe shows a coupon field natively
      success_url: "http://localhost:3000/success",
      cancel_url: "http://localhost:3000/failed",
      metadata: {
        customerName: name,
        customerEmail: email,
        packageId,
        packageName: pkg.name,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Checkout error:", err);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
