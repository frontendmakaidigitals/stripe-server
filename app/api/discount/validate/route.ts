import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { code, subtotal } = await req.json();

  const domain = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
  const adminToken = process.env.SHOPIFY_ACCESS_TOKEN!;

  const res = await fetch(
    `https://${domain}/admin/api/2024-01/discount_codes/lookup.json?code=${encodeURIComponent(code)}`,
    {
      headers: {
        "X-Shopify-Access-Token": adminToken,
        "Content-Type": "application/json",
      },
    }
  );

  const text = await res.text();
  console.log("Discount lookup status:", res.status);
  console.log("Discount lookup body:", text);

  if (!res.ok) {
    return NextResponse.json({ valid: false });
  }

  // 👇 Parse from text instead of calling res.json() again
  const discountData = JSON.parse(text);
  const discountCode = discountData?.discount_code;

  if (!discountCode) {
    return NextResponse.json({ valid: false });
  }

  // Check usage limit
  if (
    discountCode.usage_limit !== null &&
    discountCode.usage_count >= discountCode.usage_limit
  ) {
    return NextResponse.json({ valid: false, reason: "Usage limit reached" });
  }

  // Get the price rule
  const priceRuleRes = await fetch(
    `https://${domain}/admin/api/2024-01/price_rules/${discountCode.price_rule_id}.json`,
    { headers: { "X-Shopify-Access-Token": adminToken } }
  );

  const priceRuleText = await priceRuleRes.text();
  console.log("Price rule status:", priceRuleRes.status);
  console.log("Price rule body:", priceRuleText);

  if (!priceRuleRes.ok) return NextResponse.json({ valid: false });

  const priceRuleData = JSON.parse(priceRuleText);
  const rule = priceRuleData?.price_rule;

  if (!rule) return NextResponse.json({ valid: false });

  // Check minimum order
  const minOrder = parseFloat(
    rule.prerequisite_subtotal_range?.greater_than_or_equal_to ?? "0"
  );
  if (subtotal / 100 < minOrder) {
    return NextResponse.json({
      valid: false,
      reason: `Minimum order AED ${minOrder} required`,
    });
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