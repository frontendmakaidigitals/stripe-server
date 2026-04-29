import { NextRequest, NextResponse } from "next/server";

const DELIVERY_ESTIMATES: Record<string, string> = {
  "Standard": "14 business days",
  "Express": "3-5 business days",
  "Overnight": "Next business day",
  "Economy": "21-28 business days",
  "Free Shipping": "Free for orders over AED 350",
  "Same Day Delivery (Dubai) Order Before 2PM (Except weekends & Public holidays)":
    "Same day (order before 2PM)",
  "AUT": "14 business days",
};

const GQL_QUERY = `
  query GetDeliveryProfiles {
    deliveryProfiles(first: 10) {
      edges {
        node {
          name
          profileLocationGroups {
            locationGroupZones(first: 50) {
              edges {
                node {
                  zone {
                    name
                    countries {
                      code { countryCode }
                    }
                  }
                  methodDefinitions(first: 20) {
                    edges {
                      node {
                        name
                        active
                        methodConditions {
                          conditionCriteria {
                            ... on MoneyV2 {
                              amount
                              currencyCode
                            }
                          }
                          field
                          operator
                        }
                        rateProvider {
                          ... on DeliveryRateDefinition {
                            price {
                              amount
                              currencyCode
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export async function POST(req: NextRequest) {
  try {
    const { address } = await req.json();

    const countryCode = address.country.length === 2
      ? address.country.toUpperCase()
      : address.country.toUpperCase();

    const orderSubtotalAED: number = address.subtotalAED ?? 0;
    const domain = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
    const adminToken = process.env.SHOPIFY_ACCESS_TOKEN!;

    console.log(`[Shipping] GraphQL lookup: country=${countryCode} subtotal=${orderSubtotalAED}`);

    const res = await fetch(
      `https://${domain}/admin/api/2024-01/graphql.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": adminToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: GQL_QUERY }),
      }
    );

    if (!res.ok) {
      console.error("[Shipping] GraphQL error:", res.status, await res.text());
      return NextResponse.json({ rates: [] });
    }

    const { data, errors } = await res.json();

    if (errors) {
      console.error("[Shipping] GraphQL errors:", JSON.stringify(errors));
      return NextResponse.json({ rates: [] });
    }

    const profiles = data?.deliveryProfiles?.edges ?? [];
    console.log(`[Shipping] Found ${profiles.length} delivery profiles`);

    const rates: {
      handle: string;
      title: string;
      estimatedDays: string | null;
      price: { amount: string; currencyCode: string };
    }[] = [];

    for (const { node: profile } of profiles) {
      for (const group of profile.profileLocationGroups ?? []) {
        for (const { node: zoneNode } of group.locationGroupZones?.edges ?? []) {
          const zone = zoneNode.zone;

          // Check if this zone covers the requested country
          const countryInZone = zone.countries?.some(
            (c: any) => c.code?.countryCode === countryCode
          );

          if (!countryInZone) continue;

          console.log(`[Shipping] Matched zone "${zone.name}" in profile "${profile.name}"`);

          for (const { node: method } of zoneNode.methodDefinitions?.edges ?? []) {
            if (!method.active) continue;

            // Only handle flat-rate providers (DeliveryRateDefinition)
            // Carrier-calculated rates (DeliveryParticipant) have no fixed price
            const flatPrice = method.rateProvider?.price?.amount;
            if (flatPrice == null) {
              console.log(`[Shipping] Skip carrier rate: ${method.name}`);
              continue;
            }

            const priceNum = parseFloat(String(flatPrice)) || 0;

            // Evaluate min/max order subtotal conditions
            if (orderSubtotalAED > 0 && method.methodConditions?.length > 0) {
              let skip = false;
              for (const cond of method.methodConditions) {
                if (cond.field !== "TOTAL_PRICE") continue;
                const condAmount = parseFloat(String(cond.conditionCriteria?.amount ?? "0"));
                if (cond.operator === "GREATER_THAN_OR_EQUAL_TO" && orderSubtotalAED < condAmount) {
                  console.log(`[Shipping] Skip "${method.name}" — subtotal ${orderSubtotalAED} < min ${condAmount}`);
                  skip = true; break;
                }
                if (cond.operator === "LESS_THAN_OR_EQUAL_TO" && orderSubtotalAED > condAmount) {
                  console.log(`[Shipping] Skip "${method.name}" — subtotal ${orderSubtotalAED} > max ${condAmount}`);
                  skip = true; break;
                }
              }
              if (skip) continue;
            }

            rates.push({
              handle: method.name,
              title: method.name,
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

    // Sort: free (0) first, then by price ascending
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