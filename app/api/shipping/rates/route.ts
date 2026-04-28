// app/api/shipping/rates/route.ts
import { NextRequest, NextResponse } from "next/server";

const COUNTRY_CODES: Record<string, string> = {
  "United Arab Emirates": "AE",
  "Saudi Arabia": "SA",
  "India": "IN",
  "Kuwait": "KW",
  "Qatar": "QA",
  "United States": "US",
  "United Kingdom": "GB",
  "Pakistan": "PK",
  "Oman": "OM",
  "Bahrain": "BH",
  "Egypt": "EG",
};

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
  const countryCode = address.country.length === 2 
    ? address.country 
    : COUNTRY_CODES[countryName] ?? address.country;

  const domain = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
  const adminToken = process.env.SHOPIFY_ACCESS_TOKEN!;

  // Fetch all shipping zones from Shopify Admin
  const res = await fetch(
    `https://${domain}/admin/api/2024-01/shipping_zones.json`,
    {
      headers: {
        "X-Shopify-Access-Token": adminToken,
        "Content-Type": "application/json",
      },
    }
  );

  const data = await res.json();

  const zones = data?.shipping_zones ?? [];

  // Find zone that includes the customer's country
  const matchingZone = zones.find((zone: any) =>
    zone.countries?.some(
      (c: any) => c.code === countryCode || c.name === countryName
    )
  );


  if (!matchingZone) {
    // Clean up draft order if created
    return NextResponse.json({ rates: [] });
  }

  // Get price-based and weight-based rates from the zone
 const DELIVERY_ESTIMATES: Record<string, string> = {
  "Standard": "14 business days",
  "Express": "3-5 business days",
  "Overnight": "Next business day",
  "Economy": "21-28 business days",
  "Free Shipping": "14 business days",
};

const rates = [
  ...(matchingZone.price_based_shipping_rates ?? []),
  ...(matchingZone.weight_based_shipping_rates ?? []),
].map((rate: any) => ({
  handle: rate.name,
  title: rate.name,
  estimatedDays: DELIVERY_ESTIMATES[rate.name] ?? null,
  price: {
    amount: rate.price,
    currencyCode: "AED",
  },
}));

  return NextResponse.json({ rates });
}