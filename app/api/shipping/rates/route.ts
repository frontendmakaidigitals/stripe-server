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

const DELIVERY_ESTIMATES: Record<string, string> = {
  "Standard":      "14 business days",
  "Express":       "3-5 business days",
  "Overnight":     "Next business day",
  "Economy":       "21-28 business days",
  "Free Shipping": "Orders 351 AED and up",
  "Same Day Delivery (Dubai) Order Before 2PM (Except weekends & Public holidays)": "Same day",
  "AUT":           "14 business days",
};

export async function POST(req: NextRequest) {
  try {
    const { address } = await req.json();

    const countryName = COUNTRY_NAMES[address.country] ?? address.country;
    const countryCode = address.country.length === 2
      ? address.country.toUpperCase()
      : COUNTRY_CODES[countryName] ?? address.country;

    const domain     = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
    const adminToken = process.env.SHOPIFY_ACCESS_TOKEN!;

    const res = await fetch(
      `https://${domain}/admin/api/2024-01/shipping_zones.json`,
      {
        headers: {
          "X-Shopify-Access-Token": adminToken,
          "Content-Type":           "application/json",
        },
      }
    );

    const data  = await res.json();
    const zones = data?.shipping_zones ?? [];

    // Find matching zone — check both country code and name
    const matchingZone = zones.find((zone: any) =>
      zone.countries?.some(
        (c: any) =>
          c.code?.toUpperCase() === countryCode ||
          c.name?.toLowerCase() === countryName.toLowerCase()
      )
    );

    if (!matchingZone) {
      console.log(`[Shipping] No zone found for country: ${countryCode} (${countryName})`);
      console.log(`[Shipping] Available zones:`, zones.map((z: any) => z.name));
      return NextResponse.json({ rates: [] });
    }

    console.log(`[Shipping] Matched zone: ${matchingZone.name} for ${countryCode}`);

    // ✅ Include ALL rate types including carrier-calculated
    const allRates = [
      ...(matchingZone.price_based_shipping_rates    ?? []),
      ...(matchingZone.weight_based_shipping_rates   ?? []),
      ...(matchingZone.carrier_shipping_rate_providers ?? []),
    ];

    const rates = allRates.map((rate: any) => ({
      handle:       rate.id?.toString() ?? rate.name,
      title:        rate.name,
      estimatedDays: DELIVERY_ESTIMATES[rate.name] ?? null,
      price: {
        // carrier rates use 'flat_modifier', price-based use 'price'
        amount:       rate.price ?? rate.flat_modifier ?? "0",
        currencyCode: "AED",
      },
    }));

    console.log(`[Shipping] Returning ${rates.length} rates:`, rates.map((r: any) => r.title));

    return NextResponse.json({ rates });

  } catch (err) {
    console.error("[Shipping] Error:", err);
    return NextResponse.json({ rates: [] });
  }
}