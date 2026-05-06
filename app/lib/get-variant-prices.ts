// lib/get-variant-prices.ts
import type { CartItem } from "@/types/checkout.types";

export async function enrichItemsWithMarketPrices(
  items: CartItem[],
  countryCode: string,
): Promise<CartItem[]> {
  const domain = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
  const storefrontToken = process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN!;

  // Only fetch for items that have a variant_id
  const variantIds = items
    .filter((i) => i.variant_id)
    .map((i) => `gid://shopify/ProductVariant/${i.variant_id}`);

  if (!variantIds.length) return items;

  const query = `
    query getMarketPrices($ids: [ID!]!) @inContext(country: ${countryCode}) {
      nodes(ids: $ids) {
        ... on ProductVariant {
          id
          price {
            amount
            currencyCode
          }
        }
      }
    }
  `;

  const res = await fetch(
    `https://${domain}/api/2024-01/graphql.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Storefront-Access-Token": storefrontToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables: { ids: variantIds } }),
    },
  );

  if (!res.ok) {
    console.warn("[Storefront] Failed to fetch market prices, using original");
    return items;
  }

  const data = await res.json();
  const nodes: { id: string; price: { amount: string; currencyCode: string } }[] =
    data.data?.nodes ?? [];

  // Build a map of variantId → market price
  const priceMap = new Map<string, number>();
  for (const node of nodes) {
    if (!node?.id) continue;
    const numericId = node.id.replace("gid://shopify/ProductVariant/", "");
    priceMap.set(numericId, parseFloat(node.price.amount));
  }

  // Return items with market price applied
  return items.map((item) => {
    if (!item.variant_id) return item;
    const marketPrice = priceMap.get(item.variant_id);
    if (!marketPrice) return item;
    return {
      ...item,
      base_price: item.price,    // keep original for reference
      price: marketPrice,        // override with market price
    };
  });
}