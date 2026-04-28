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

  const domain = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
  const adminToken = process.env.SHOPIFY_ACCESS_TOKEN!;

  // Use Admin API to create a draft order and get shipping rates
  const res = await fetch(
    `https://${domain}/admin/api/2024-01/draft_orders.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": adminToken,
      },
      body: JSON.stringify({
        draft_order: {
          line_items: address.lineItems.map(
            (item: { variantId: string; quantity: number }) => ({
              variant_id: item.variantId.replace(
                "gid://shopify/ProductVariant/",
                ""
              ),
              quantity: item.quantity,
            })
          ),
          shipping_address: {
            address1: address.address1,
            city: address.city,
            country: countryName,
            phone: address.phone,
          },
        },
      }),
    }
  );

  const data = await res.json();
  console.log("Draft order response:", JSON.stringify(data, null, 2));

  // Extract shipping rates from draft order
  const shippingLine = data?.draft_order?.shipping_line;
  const availableRates = data?.draft_order?.available_shipping_rates ?? [];

  console.log("Available rates:", availableRates);

  // Map to our ShippingRate format
  const rates = availableRates.map((rate: any) => ({
    handle: rate.name,
    title: rate.name,
    price: {
      amount: rate.price,
      currencyCode: data?.draft_order?.currency ?? "AED",
    },
  }));

  // If no available_shipping_rates, fall back to the assigned shipping line
  if (rates.length === 0 && shippingLine) {
    rates.push({
      handle: shippingLine.title,
      title: shippingLine.title,
      price: {
        amount: shippingLine.price,
        currencyCode: data?.draft_order?.currency ?? "AED",
      },
    });
  }

  console.log("Final rates:", rates);

  // Clean up — delete the draft order so it doesn't clutter admin
  if (data?.draft_order?.id) {
    await fetch(
      `https://${domain}/admin/api/2024-01/draft_orders/${data.draft_order.id}.json`,
      {
        method: "DELETE",
        headers: { "X-Shopify-Access-Token": adminToken },
      }
    );
  }

  return NextResponse.json({ rates });
}