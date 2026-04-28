// app/api/discount/auto/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { subtotal } = await req.json();
  console.log("Auto discount check, subtotal:", subtotal);

  const domain = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
  const adminToken = process.env.SHOPIFY_ACCESS_TOKEN!;

  const res = await fetch(
    `https://${domain}/admin/api/2024-01/price_rules.json?limit=50`,
    { headers: { "X-Shopify-Access-Token": adminToken } }
  );

  const text = await res.text();
  console.log("Price rules status:", res.status);
  console.log("Price rules body:", text);

  const data = JSON.parse(text);
  const rules = data?.price_rules ?? [];
  const subtotalAED = subtotal / 100;

  console.log("Total rules found:", rules.length);
  console.log("subtotalAED:", subtotalAED);

  for (const rule of rules) {
    console.log("Checking rule:", rule.title, {
      customer_selection: rule.customer_selection,
      value_type: rule.value_type,
      value: rule.value,
      starts_at: rule.starts_at,
      ends_at: rule.ends_at,
      prerequisite_subtotal_range: rule.prerequisite_subtotal_range,
    });

    if (rule.customer_selection !== "all") {
      console.log("Skipping — customer_selection is:", rule.customer_selection);
      continue;
    }

    const minOrder = parseFloat(
      rule.prerequisite_subtotal_range?.greater_than_or_equal_to ?? "0"
    );
    if (subtotalAED < minOrder) {
      console.log("Skipping — subtotal", subtotalAED, "< minOrder", minOrder);
      continue;
    }

    const now = new Date();
    if (rule.starts_at && new Date(rule.starts_at) > now) {
      console.log("Skipping — not started yet");
      continue;
    }
    if (rule.ends_at && new Date(rule.ends_at) < now) {
      console.log("Skipping — expired");
      continue;
    }

    const isPercentage = rule.value_type === "percentage";
    const amount = Math.abs(parseFloat(rule.value));

    console.log("✅ Auto discount matched:", rule.title, amount);

    return NextResponse.json({
      valid: true,
      code: rule.title,
      type: isPercentage ? "percentage" : "fixed",
      amount,
      automatic: true,
    });
  }

  console.log("No auto discount matched");
  return NextResponse.json({ valid: false });
}