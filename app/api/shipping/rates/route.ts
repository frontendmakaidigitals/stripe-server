// app/api/shipping/rates/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { address } = await req.json();

  const query = `
    mutation checkoutCreate($input: CheckoutCreateInput!) {
      checkoutCreate(input: $input) {
        checkout {
          id
          availableShippingRates {
            ready
            shippingRates {
              handle
              title
              price { amount currencyCode }
            }
          }
        }
        checkoutUserErrors { message field }
      }
    }
  `;

  const res = await fetch(
    `https://${process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN}/api/2024-01/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token":
          process.env.SHOPIFY_STOREFRONT_TOKEN!,
      },
      body: JSON.stringify({
        query,
        variables: {
          input: {
            shippingAddress: {
              address1: address.address1,
              city: address.city,
              country: address.country,
              phone: address.phone,
            },
            lineItems: address.lineItems, // [{ variantId, quantity }]
          },
        },
      }),
    }
  );

  const data = await res.json();
  const rates =
    data?.data?.checkoutCreate?.checkout?.availableShippingRates?.shippingRates ?? [];

  return NextResponse.json({ rates });
}