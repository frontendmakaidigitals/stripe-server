import { NextRequest, NextResponse } from "next/server";

const DELIVERY_ESTIMATES: Record<string, string> = {
  "Standard": "14 business days",
  "Express": "3-5 business days",
  "Overnight": "Next business day",
  "Economy": "21-28 business days",
  "Free Shipping": "Free for orders over AED 351",
  "Same Day Delivery (Dubai) Order Before 2PM (Except weekends & Public holidays)":
    "Same day (order before 2PM)",
  "AUT": "14 business days",
};

export async function POST(req: NextRequest) {
  try {
    const { address } = await req.json();

    const countryCode =
      address.country.length === 2
        ? address.country.toUpperCase()
        : address.country.toUpperCase();

    const orderSubtotalAED: number = address.subtotalAED ?? 0;
    const domain = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
    const adminToken = process.env.SHOPIFY_ACCESS_TOKEN!;

    console.log(`[Shipping] Looking up rates for country=${countryCode} subtotal=${orderSubtotalAED}`);

    // ── delivery_profiles returns rates from ALL profiles (default + custom) ──
    const res = await fetch(
      `https://${domain}/admin/api/2024-01/delivery_profiles.json`,
      {
        headers: {
          "X-Shopify-Access-Token": adminToken,
          "Content-Type": "application/json",
        },
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("[Shipping] delivery_profiles API error:", res.status, text);
      return NextResponse.json({ rates: [] });
    }

    const { delivery_profiles } = await res.json();
    console.log(`[Shipping] Found ${delivery_profiles?.length ?? 0} profiles`);

    const rates: {
      handle: string;
      title: string;
      estimatedDays: string | null;
      price: { amount: string; currencyCode: string };
    }[] = [];

    for (const profile of delivery_profiles ?? []) {
      for (const group of profile.profile_location_groups ?? []) {
        for (const zoneEntry of group.location_group_zones ?? []) {
          const zone = zoneEntry.zone;

          // Check if this zone covers the requested country
          const countryInZone = zone.countries?.some(
            (c: any) => c.code?.toUpperCase() === countryCode
          );

          if (!countryInZone) continue;

          console.log(
            `[Shipping] Matched zone "${zone.name}" in profile "${profile.name}"`,
            `— methods: ${zoneEntry.method_definitions?.length ?? 0}`
          );

          // Log the raw method_definitions so we can see what Shopify returns
          console.log(
            "[Shipping] Raw methods:",
            JSON.stringify(zoneEntry.method_definitions, null, 2)
          );

          for (const method of zoneEntry.method_definitions ?? []) {
            // Price lives at method.rate_provider.price.amount (flat rate)
            // or method.rate_provider.shipping_rate.price for carrier rates
            const flatPrice =
              method.rate_provider?.price?.amount ??
              method.rate_provider?.shipping_rate?.price?.amount ??
              null;

            if (flatPrice === null) {
              // Carrier-calculated — no fixed price, skip
              console.log(`[Shipping] Skip carrier rate: ${method.name}`);
              continue;
            }

            const priceNum = parseFloat(String(flatPrice)) || 0;

            // Enforce min/max order subtotal conditions
            const cond = method.price_condition;
            if (cond && orderSubtotalAED > 0) {
              const min = cond.subtotal_minimum?.amount != null
                ? parseFloat(String(cond.subtotal_minimum.amount))
                : null;
              const max = cond.subtotal_maximum?.amount != null
                ? parseFloat(String(cond.subtotal_maximum.amount))
                : null;

              if (min !== null && orderSubtotalAED < min) {
                console.log(`[Shipping] Skip "${method.name}" — subtotal ${orderSubtotalAED} < min ${min}`);
                continue;
              }
              if (max !== null && orderSubtotalAED > max) {
                console.log(`[Shipping] Skip "${method.name}" — subtotal ${orderSubtotalAED} > max ${max}`);
                continue;
              }
            }

            rates.push({
              handle: method.id?.toString() ?? method.name,
              title: method.name ?? "Standard Shipping",
              estimatedDays: DELIVERY_ESTIMATES[method.name] ?? null,
              price: {
                amount: priceNum.toFixed(2),
                currencyCode: "AED",
              },
            });
          }
        }
      }
    }

    // Sort: free (0) first, then cheapest
    rates.sort((a, b) => parseFloat(a.price.amount) - parseFloat(b.price.amount));

    console.log(
      `[Shipping] Returning ${rates.length} rates:`,
      rates.map((r) => `${r.title} = ${r.price.amount} AED`)
    );

    return NextResponse.json({ rates });
  } catch (err) {
    console.error("[Shipping] Unexpected error:", err);
    return NextResponse.json({ rates: [] });
  }
}