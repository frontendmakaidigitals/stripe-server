// app/api/shopify/variants/route.ts
import { NextRequest, NextResponse } from "next/server";

const SHOPIFY_DOMAIN = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
const SHOPIFY_TOKEN  = process.env.SHOPIFY_ACCESS_TOKEN!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const { variantIds } = await request.json() as { variantIds: string[] };

    if (!variantIds?.length) {
      return NextResponse.json(
        { error: "variantIds required" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Shopify GraphQL global IDs
    const gids = variantIds.map(
      (id) => `"gid://shopify/ProductVariant/${id}"`,
    );

    const query = `{
      nodes(ids: [${gids.join(",")}]) {
        ... on ProductVariant {
          id
          sku
          price
          compareAtPrice
          title
          product {
            title
            featuredImage { url }
          }
        }
      }
    }`;

    const res = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/graphql.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("[Shopify variants] API error:", err);
      return NextResponse.json(
        { error: "Shopify API error" },
        { status: 502, headers: CORS_HEADERS },
      );
    }

    const { data, errors } = await res.json();

    if (errors?.length) {
      console.error("[Shopify variants] GraphQL errors:", errors);
      return NextResponse.json(
        { error: errors[0].message },
        { status: 422, headers: CORS_HEADERS },
      );
    }

    // Map back to flat objects, preserving original variant_id
    const variants = (data.nodes as any[]).map((node) => {
      const numericId = node.id.replace("gid://shopify/ProductVariant/", "");
      return {
        variant_id:     numericId,
        sku:            node.sku            || "",
        price:          parseFloat(node.price),           // AED
        compareAtPrice: node.compareAtPrice
          ? parseFloat(node.compareAtPrice)
          : null,
        variantTitle:   node.title          || "",
        product_title:  node.product.title  || "",
        image:          node.product.featuredImage?.url || "",
      };
    });

    return NextResponse.json({ variants }, { headers: CORS_HEADERS });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch variants";
    console.error("[Shopify variants] Error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}