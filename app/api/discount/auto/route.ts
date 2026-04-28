// app/api/discount/auto/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { subtotal } = await req.json();

  const domain = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
  const adminToken = process.env.SHOPIFY_ACCESS_TOKEN!;

  // Automatic discounts live in GraphQL, not REST price_rules
  const query = `{
    automaticDiscountNodes(first: 20) {
      nodes {
        id
        automaticDiscount {
          ... on DiscountAutomaticBxgy {
            title
            status
            customerBuys {
              value {
                ... on DiscountQuantity { quantity }
                ... on DiscountAmount { amount { amount } }
              }
              items {
                ... on AllDiscountItems { allItems }
              }
            }
            customerGets {
              value {
                ... on DiscountOnQuantity {
                  quantity { quantity }
                  effect {
                    ... on DiscountAmount { amount { amount } }
                    ... on DiscountPercentage { percentage }
                  }
                }
              }
            }
            startsAt
            endsAt
          }
          ... on DiscountAutomaticBasic {
            title
            status
            minimumRequirement {
              ... on DiscountMinimumSubtotal {
                greaterThanOrEqualToSubtotal { amount }
              }
              ... on DiscountMinimumQuantity {
                greaterThanOrEqualToQuantity
              }
            }
            customerGets {
              value {
                ... on DiscountPercentage { percentage }
                ... on DiscountAmount { amount { amount } }
              }
            }
            startsAt
            endsAt
          }
        }
      }
    }
  }`;

  const res = await fetch(
    `https://${domain}/admin/api/2024-01/graphql.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": adminToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );

  const data = await res.json();
  const nodes = data?.data?.automaticDiscountNodes?.nodes ?? [];

  const subtotalAED = subtotal; // already in AED, no division needed

  for (const node of nodes) {
    const discount = node.automaticDiscount;
    if (!discount) continue;

    // Skip inactive
    if (discount.status !== "ACTIVE") continue;

    // Check date range
    const now = new Date();
    if (discount.startsAt && new Date(discount.startsAt) > now) continue;
    if (discount.endsAt && new Date(discount.endsAt) < now) continue;

    // Handle DiscountAutomaticBasic (percentage or fixed off order)
    if (discount.minimumRequirement !== undefined) {
      const minSubtotal = parseFloat(
        discount.minimumRequirement?.greaterThanOrEqualToSubtotal?.amount ?? "0"
      );

      if (subtotalAED < minSubtotal) continue;

      const gets = discount.customerGets?.value;
      if (!gets) continue;

      const isPercentage = gets.percentage !== undefined;
      const amount = isPercentage
        ? gets.percentage * 100
        : parseFloat(gets.amount?.amount ?? "0");

      return NextResponse.json({
        valid: true,
        code: discount.title,
        type: isPercentage ? "percentage" : "fixed",
        amount,
        automatic: true,
      });
    }

    // Handle DiscountAutomaticBxgy (Buy X Get Y)
    if (discount.customerBuys !== undefined) {
      const minAmount = parseFloat(
        discount.customerBuys?.value?.amount?.amount ?? "0"
      );

      if (minAmount > 0 && subtotalAED < minAmount) continue;

      const effect = discount.customerGets?.value?.effect;
      if (!effect) continue;

      const isPercentage = effect.percentage !== undefined;
      const amount = isPercentage
        ? effect.percentage * 100
        : parseFloat(effect.amount?.amount ?? "0");

      return NextResponse.json({
        valid: true,
        code: discount.title,
        type: isPercentage ? "percentage" : "fixed",
        amount,
        automatic: true,
        isBxgy: true, // flag so UI can show "Buy 2 get discount" messaging
      });
    }
  }

  return NextResponse.json({ valid: false });
}