import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // ✅ Shopify cart flow (from your store's checkout button)
    if (body.items) {
      const { items, currency } = body;

      const lineItems = items.map((item: any) => ({
        price_data: {
          currency: currency?.toLowerCase() || "aed",
          product_data: {
            name: item.product_title,
            images: item.image ? [item.image] : [],
          },
          unit_amount: item.price, // already in cents from Shopify
        },
        quantity: item.quantity,
      }));

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: lineItems,
        allow_promotion_codes: true,
        success_url: `${process.env.NEXT_PUBLIC_URL}/success`,
        cancel_url: `${process.env.NEXT_PUBLIC_URL}/cancel`,
      });

      return NextResponse.json({ url: session.url }, { headers: CORS_HEADERS });
    }

    // ✅ Package-based flow (from your Next.js storefront)
    const { email, name, packageId } = body;

    if (!email || !name || !packageId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const PACKAGES: Record<string, { priceId: string; name: string }> = {
      "dog-food": {
        priceId: "price_1TPit7235n3eBgYvd7Oi0vlA",
        name: "Dog Food",
      },
      "cat-food": {
        priceId: "price_1TPiP5235n3eBgYvgTHOesdy",
        name: "Cat Food",
      },
      perfume: { priceId: "price_1TPiOH235n3eBgYvoly8K2Pa", name: "Perfume" },
    };

    const pkg = PACKAGES[packageId];
    if (!pkg) {
      return NextResponse.json(
        { error: "Invalid package" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [{ price: pkg.priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${baseUrl}/success`,
      cancel_url: `${baseUrl}/cancel`,
      metadata: {
        customerName: name,
        customerEmail: email,
        packageId,
        packageName: pkg.name,
      },
    });

    return NextResponse.json({ url: session.url }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("Checkout error:", err);
    return NextResponse.json(
      { error: "Checkout failed" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
