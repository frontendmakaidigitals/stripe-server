import { NextRequest, NextResponse } from "next/server";
type Country = {
  code: string;
  name: string;
};

type ShippingRate = {
  id?: number | string;
  name?: string;
  price?: string;
  min_order_subtotal?: string | null;
  max_order_subtotal?: string | null;
};

type ShippingZone = {
  name: string;
  countries?: Country[];
  price_based_shipping_rates?: ShippingRate[];
  weight_based_shipping_rates?: ShippingRate[];
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
  DE: "Germany",
  FR: "France",
  IT: "Italy",
  ES: "Spain",
  NL: "Netherlands",
  BE: "Belgium",
  AT: "Austria",
  CH: "Switzerland",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  PT: "Portugal",
  PL: "Poland",
  CZ: "Czech Republic",
  RO: "Romania",
  BG: "Bulgaria",
  CY: "Cyprus",
  CA: "Canada",
  AU: "Australia",
  NZ: "New Zealand",
  JP: "Japan",
  SG: "Singapore",
  BR: "Brazil",
  ZA: "South Africa",
};

const DELIVERY_ESTIMATES: Record<string, string> = {
  "Standard": "14 business days",
  "Express": "3-5 business days",
  "Overnight": "Next business day",
  "Economy": "21-28 business days",
  "Free Shipping": "Free for orders over AED 351",
  "Same Day Delivery (Dubai) Order Before 2PM (Except weekends & Public holidays)": "Same day (order before 2PM)",
  "AUT": "14 business days",
  "Aramex": "Calculated transit time",
};

export async function POST(req: NextRequest) {
  try {
    const { address } = await req.json();

    // Normalise to 2-letter ISO code
    const countryCode =
      address.country.length === 2
        ? address.country.toUpperCase()
        : Object.keys(COUNTRY_NAMES).find(
            (k) =>
              COUNTRY_NAMES[k].toLowerCase() ===
              address.country.toLowerCase()
          ) ?? address.country;

    const countryName =
      COUNTRY_NAMES[countryCode] ?? address.country;

    const domain = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
    const adminToken = process.env.SHOPIFY_ACCESS_TOKEN!;

    // Also send the subtotal so we can evaluate conditional rates
    const orderSubtotalAED: number = address.subtotalAED ?? 0;

    const res = await fetch(
      `https://${domain}/admin/api/2024-01/shipping_zones.json`,
      {
        headers: {
          "X-Shopify-Access-Token": adminToken,
          "Content-Type": "application/json",
        },
      }
    );

    if (!res.ok) {
      console.error("[Shipping] Shopify API error:", res.status, await res.text());
      return NextResponse.json({ rates: [] });
    }

    const data = await res.json();
   const zones: ShippingZone[] = data?.shipping_zones ?? [];

    console.log(
      `[Shipping] Total zones: ${zones.length}`,
      zones.map((z) => `${z.name} (${z.countries?.map((c: any) => c.code).join(", ")})`)
    );

    // Find the zone that contains this country
    const matchingZone = zones.find((zone: any) =>
      zone.countries?.some(
        (c: any) =>
          c.code?.toUpperCase() === countryCode ||
          c.name?.toLowerCase() === countryName.toLowerCase()
      )
    );

    if (!matchingZone) {
      console.log(`[Shipping] No zone for: ${countryCode} (${countryName})`);
      return NextResponse.json({ rates: [] });
    }

    console.log(`[Shipping] Matched zone: "${matchingZone.name}" for ${countryCode}`);

    // ── 1. Price-based rates (most common — Standard, Free Shipping, Same Day) ──
    const priceBased: any[] = matchingZone.price_based_shipping_rates ?? [];
    // ── 2. Weight-based rates ──
    const weightBased: any[] = matchingZone.weight_based_shipping_rates ?? [];
    // ── 3. Carrier-calculated (Aramex, etc.) — skip; no price available at this stage ──
    // carrier_shipping_rate_providers have no fixed price, so we omit them
    // to avoid showing "Calculated" with no amount

    const rates: {
      handle: string;
      title: string;
      estimatedDays: string | null;
      price: { amount: string; currencyCode: string };
    }[] = [];

    // Process price-based rates
    for (const rate of priceBased) {
      const price = parseFloat(String(rate.price ?? "0")) || 0;

      // Enforce min-order conditions
      // Shopify stores min_order_subtotal as a string like "351.00" or null
      const minSubtotal = rate.min_order_subtotal
        ? parseFloat(rate.min_order_subtotal)
        : null;
      const maxSubtotal = rate.max_order_subtotal
        ? parseFloat(rate.max_order_subtotal)
        : null;

      // If the zone currency is AED and we have a subtotal, skip rates whose
      // conditions aren't met. (When subtotal is unknown we show all rates.)
      if (orderSubtotalAED > 0) {
        if (minSubtotal !== null && orderSubtotalAED < minSubtotal) {
          console.log(`[Shipping] Skipping "${rate.name}" — subtotal ${orderSubtotalAED} < min ${minSubtotal}`);
          continue;
        }
        if (maxSubtotal !== null && orderSubtotalAED > maxSubtotal) {
          console.log(`[Shipping] Skipping "${rate.name}" — subtotal ${orderSubtotalAED} > max ${maxSubtotal}`);
          continue;
        }
      }
 console.log("Zones:", JSON.stringify(zones.map(z => ({
  name: z.name,
  countries: z.countries?.map(c => c.code)
})), null, 2));


      rates.push({
        handle: rate.id?.toString() ?? rate.name,
        title: rate.name ?? "Standard Shipping",
        estimatedDays: DELIVERY_ESTIMATES[rate.name] ?? null,
        price: {
          amount: price.toFixed(2),
          currencyCode: "AED",
        },
      });
    }
  console.log("All zones:", JSON.stringify(zones.map((z: any) => ({
    name: z.name,
    countries: z.countries?.map((c: any) => ({ code: c.code, name: c.name }))
  })), null, 2));
    // Process weight-based rates
    for (const rate of weightBased) {
      const price = parseFloat(String(rate.price ?? "0")) || 0;
      rates.push({
        handle: rate.id?.toString() ?? rate.name,
        title: rate.name ?? "Standard Shipping",
        estimatedDays: DELIVERY_ESTIMATES[rate.name] ?? null,
        price: {
          amount: price.toFixed(2),
          currencyCode: "AED",
        },
      });
    }

    // Sort: free first, then by price ascending
    rates.sort((a, b) => {
      const pa = parseFloat(a.price.amount);
      const pb = parseFloat(b.price.amount);
      return pa - pb;
    });

    console.log(
      `[Shipping] Returning ${rates.length} rates:`,
      rates.map((r) => `${r.title} = ${r.price.amount} ${r.price.currencyCode}`)
    );

    return NextResponse.json({ rates });
  } catch (err) {
    console.error("[Shipping] Unexpected error:", err);
    return NextResponse.json({ rates: [] });
  }
}