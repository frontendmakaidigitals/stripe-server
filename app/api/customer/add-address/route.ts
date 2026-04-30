import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { customerId, address } = await req.json();

  const domain = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
  const adminToken = process.env.SHOPIFY_ACCESS_TOKEN!;

  // Extract numeric ID from Shopify GID if needed
  // e.g. "gid://shopify/Customer/123456" → "123456"
  const numericId = customerId?.toString().includes("/")
    ? customerId.split("/").pop()
    : customerId;

  const res = await fetch(
    `https://${domain}/admin/api/2024-01/customers/${numericId}/addresses.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": adminToken,
        "Content-Type": "application/json",
      },
     body: JSON.stringify({
      address: {
        first_name: address.firstName,
        last_name: address.lastName,
        address1: address.address1,
        city: address.city,
        country_code: address.countryCode,
        province_code: address.province || "",  // ← add this
        zip: address.zip || "",
        phone: address.phone || "",
      },
    }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json(
      { error: data.errors || "Failed to save address" },
      { status: res.status }
    );
  }

  return NextResponse.json({ address: data.customer_address });
}