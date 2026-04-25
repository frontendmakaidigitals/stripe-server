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
async function getShopifyProduct(productId: string) {
  const res = await fetch(
    `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/products/${productId}.json`,
    {
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN!,
      },
    },
  );

  if (!res.ok) return null;
  const { product } = await res.json();
  return product;
}

export async function POST(request: NextRequest) {
  try {
    const { email, name, productId, variantId } = await request.json();

    if (!email || !name || !productId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const product = await getShopifyProduct(productId);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Pick the right variant (or default to first)
    const variant = variantId
      ? product.variants.find((v: any) => v.id === variantId)
      : product.variants[0];

    if (!variant) {
      return NextResponse.json({ error: "Variant not found" }, { status: 404 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "usd", // or pull from your Shopify store currency
            unit_amount: Math.round(parseFloat(variant.price) * 100), // Shopify price is a string like "29.99"
            product_data: {
              name: product.title,
              description:
                variant.title !== "Default Title" ? variant.title : undefined,
              images: product.image ? [product.image.src] : [],
            },
          },
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      success_url: "http://localhost:3000/success",
      cancel_url: "http://localhost:3000/failed",
      metadata: {
        customerName: name,
        customerEmail: email,
        shopifyProductId: productId,
        shopifyVariantId: variant.id,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Checkout error:", err);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
