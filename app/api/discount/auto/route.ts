import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { subtotal } = await req.json();

  const domain = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
  const adminToken = process.env.SHOPIFY_ACCESS_TOKEN!;

  // Fetch all active price rules
  const res = await fetch(
    `https://${domain}/admin/api/2024-01/price_rules.json?limit=50`,
    { headers: { "X-Shopify-Access-Token": adminToken } }
  );

  const data = await res.json();
  const rules = data?.price_rules ?? [];

  const subtotalAED = subtotal / 100;

  for (const rule of rules) {
    // Only automatic discounts (no code required)
    if (rule.customer_selection !== "all") continue;

    // Check minimum order
    const minOrder = parseFloat(
      rule.prerequisite_subtotal_range?.greater_than_or_equal_to ?? "0"
    );
    if (subtotalAED < minOrder) continue;

    // Check if active
    const now = new Date();
    if (rule.starts_at && new Date(rule.starts_at) > now) continue;
    if (rule.ends_at && new Date(rule.ends_at) < now) continue;

    const isPercentage = rule.value_type === "percentage";
    const amount = Math.abs(parseFloat(rule.value));

    return NextResponse.json({
      valid: true,
      code: rule.title,
      type: isPercentage ? "percentage" : "fixed",
      amount,
      automatic: true,
    });
  }

  return NextResponse.json({ valid: false });
}