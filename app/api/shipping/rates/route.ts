// app/api/shipping/rates/route.ts
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
  console.log("Shipping request:", { 
    address1: address.address1, 
    city: address.city, 
    country: countryName,  // should log "India"
    lineItems: address.lineItems 
  });
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
              country: countryName,
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
 console.log("Shopify full response:", JSON.stringify(data, null, 2));
  
  const checkout = data?.data?.checkoutCreate?.checkout;
  const errors = data?.data?.checkoutCreate?.checkoutUserErrors;
  
  console.log("Checkout errors:", errors);
  console.log("Rates ready:", checkout?.availableShippingRates?.ready);
  console.log("Raw rates:", checkout?.availableShippingRates?.shippingRates);
  return NextResponse.json({ rates });
}