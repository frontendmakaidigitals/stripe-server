// app/api/discount/validate/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { code, subtotal } = await req.json();

  const domain = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
  const adminToken = process.env.SHOPIFY_ACCESS_TOKEN!;

  // Query Shopify Admin for price rules matching this code
  const res = await fetch(
    `https://${domain}/admin/api/2024-01/discount_codes/lookup.json?code=${encodeURIComponent(code)}`,
    {
      headers: {
        "X-Shopify-Access-Token": adminToken,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    return NextResponse.json({ valid: false });
  }

  const discountData = await res.json();
  const discountCode = discountData?.discount_code;

  if (!discountCode || discountCode.usage_count >= (discountCode.usage_limit ?? Infinity)) {
    return NextResponse.json({ valid: false });
  }

  // Get the price rule for this discount
  const priceRuleRes = await fetch(
    `https://${domain}/admin/api/2024-01/price_rules/${discountCode.price_rule_id}.json`,
    {
      headers: { "X-Shopify-Access-Token": adminToken },
    }
  );

  const priceRuleData = await priceRuleRes.json();
  const rule = priceRuleData?.price_rule;

  if (!rule) return NextResponse.json({ valid: false });

  // Check minimum order requirement
  const minOrder = parseFloat(rule.prerequisite_subtotal_range?.greater_than_or_equal_to ?? "0");
  if (subtotal / 100 < minOrder) {
    return NextResponse.json({ valid: false, reason: `Minimum order AED ${minOrder} required` });
  }

  const isPercentage = rule.value_type === "percentage";
  const amount = Math.abs(parseFloat(rule.value));

  return NextResponse.json({
    valid: true,
    code: code.toUpperCase(),
    type: isPercentage ? "percentage" : "fixed",
    amount,
  });
}