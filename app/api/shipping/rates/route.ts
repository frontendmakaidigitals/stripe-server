import { NextRequest, NextResponse } from "next/server";

const COUNTRY_NAMES: Record<string, string> = {
  AE: "United Arab Emirates",
  SA: "Saudi Arabia",
  IN: "India",
  KW: "Kuwait",
  QA: "Qatar",
  US: "United States",
  GB: "United Kingdom",
  PK: "Pakistan",
  OM: "Oman",
  BH: "Bahrain",
  EG: "Egypt",
};

export async function POST(req: NextRequest) {
  const { address } = await req.json();
  const countryName = COUNTRY_NAMES[address.country] ?? address.country;

  const domain = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
  const token = process.env.SHOPIFY_STOREFRONT_TOKEN!;
  const headers = {
    "Content-Type": "application/json",
    "X-Shopify-Storefront-Access-Token": token,
  };

  // Step 1 — Create a cart
  const createCart = await fetch(`https://${domain}/api/2024-10/graphql.json`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: `
        mutation cartCreate($input: CartInput!) {
          cartCreate(input: $input) {
            cart { id }
            userErrors { field message }
          }
        }
      `,
      variables: {
        input: {
          lines: address.lineItems.map(
            (item: { variantId: string; quantity: number }) => ({
              merchandiseId: item.variantId.startsWith("gid://")
                ? item.variantId
                : `gid://shopify/ProductVariant/${item.variantId}`,
              quantity: item.quantity,
            })
          ),
          buyerIdentity: {
            deliveryAddressPreferences: [
              {
                deliveryAddress: {
                  address1: address.address1,
                  city: address.city,
                  country: countryName,
                  phone: address.phone,
                },
              },
            ],
          },
        },
      },
    }),
  });

  const cartData = await createCart.json();
  console.log("Cart create response:", JSON.stringify(cartData, null, 2));

  const cartId = cartData?.data?.cartCreate?.cart?.id;
  if (!cartId) {
    console.error("Cart creation failed:", cartData?.data?.cartCreate?.userErrors);
    return NextResponse.json({ rates: [] });
  }

  // Step 2 — Fetch delivery options  👇 added first: 10
  const deliveryQuery = await fetch(`https://${domain}/api/2024-10/graphql.json`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: `
        query getDeliveryOptions($cartId: ID!) {
          cart(id: $cartId) {
            deliveryGroups(first: 10) {
              edges {
                node {
                  deliveryOptions {
                    handle
                    title
                    estimatedCost {
                      amount
                      currencyCode
                    }
                  }
                }
              }
            }
          }
        }
      `,
      variables: { cartId },
    }),
  });

  const deliveryData = await deliveryQuery.json();
  console.log("Delivery options response:", JSON.stringify(deliveryData, null, 2));

  const groups = deliveryData?.data?.cart?.deliveryGroups?.edges ?? [];
  const rates = groups.flatMap((edge: any) =>
    edge.node.deliveryOptions.map((opt: any) => ({
      handle: opt.handle,
      title: opt.title,
      price: {
        amount: opt.estimatedCost.amount,
        currencyCode: opt.estimatedCost.currencyCode,
      },
    }))
  );

  console.log("Final rates:", rates);
  return NextResponse.json({ rates });
}