import { markTokenUsed } from "@/app/lib/used-tokens";
import { NextRequest, NextResponse } from "next/server";
import type { CartItem, CustomerInfo } from "@/app/lib/checkout-token";

interface CODRequest {
  items: CartItem[];
  currency: string;
  customer: CustomerInfo;
  token?: string;
  shipping?: number;
  shippingHandle?: string;
  codFee?: number;
  discountCode?: string;       // ← add
  discountAmount?: number;     // ← add
  discountType?: string | null; // ← add
}

async function createShopifyOrder(
  items: CartItem[],
  customer: CustomerInfo,
  currency: string,
  codFee: number = 0,
  discountCode?: string,  
) {
  const domain = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
  const token  = process.env.SHOPIFY_ACCESS_TOKEN!;

  const [firstName, ...rest] = customer.name.trim().split(" ");
  const lastName = rest.join(" ") || "-";

  const address = {
    first_name: firstName,
    last_name:  lastName,
    address1:   customer.address,
    city:       customer.city,
    country:    customer.country || "AE",
    phone:      customer.phone,
  };

  const lineItems: object[] = items.map((item) =>
    item.variant_id
      ? { variant_id: parseInt(item.variant_id, 10), quantity: item.quantity }
      : {
          title:             item.product_title,
          price:             item.price.toFixed(2),  // already decimal
          quantity:          item.quantity,
          requires_shipping: true,
          taxable:           false,
        },
  );

  // ✅ Add COD fee as a line item
  if (codFee > 0) {
    lineItems.push({
      title:             "Cash on Delivery Fee (10%)",
      price:             codFee.toFixed(2),
      quantity:          1,
      requires_shipping: false,
      taxable:           false,
    });
  }

   const draftRes = await fetch(
    `https://${domain}/admin/api/2024-01/draft_orders.json`,
    {
      method: "POST",
      headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({
        draft_order: {
          line_items: lineItems,
          email: customer.email,
          shipping_address: address,
          billing_address: address,
          note: `COD order — phone: ${customer.phone}${codFee > 0 ? ` | COD fee: ${codFee.toFixed(2)} ${currency}` : ""}`,
          tags: "COD, custom-checkout",
          send_receipt: false,
          ...(discountCode ? { applied_discount: {
            value_type: "percentage",   // Shopify will look it up by code
            value: "0",
            title: discountCode,
            description: discountCode,
            application_type: "discount_code",  // ← tells Shopify to apply the actual code
          }} : {}),
        },
      }),
    },
  );

  if (!draftRes.ok) {
    const err = await draftRes.text();
    console.error("Shopify draft order error:", err);
    throw new Error(`Shopify error: ${draftRes.status}`);
  }

  const { draft_order: draft } = await draftRes.json();

  const completeRes = await fetch(
    `https://${domain}/admin/api/2024-01/draft_orders/${draft.id}/complete.json?payment_pending=true`,
    {
      method:  "PUT",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type":           "application/json",
      },
    },
  );

  if (!completeRes.ok) {
    console.warn("Draft order created but completion failed. Draft ID:", draft.id);
    return { orderId: draft.name, numericId: draft.id };
  }

  const { draft_order: completed } = await completeRes.json();

  console.log(
    `✅ COD order created: ${completed.name}`,
    `customer=${customer.email}`,
    `total=${completed.total_price} ${currency}`,
    codFee > 0 ? `codFee=${codFee.toFixed(2)}` : "",
  );

  return { orderId: completed.name, numericId: completed.id };
}

export async function POST(request: NextRequest) {
  try {
    const body: CODRequest = await request.json();
    const { items, currency = "AED", customer, codFee = 0, discountCode } = body;

    if (!items?.length) {
      return NextResponse.json({ error: "No items in cart" }, { status: 400 });
    }
    if (!customer?.name || !customer?.email || !customer?.phone || !customer?.address || !customer?.city) {
      return NextResponse.json({ error: "Missing customer details" }, { status: 400 });
    }

const result = await createShopifyOrder(items, customer, currency, codFee, discountCode);

    const token = request.headers.get("x-checkout-token") || body.token;
    if (token) markTokenUsed(token);

    return NextResponse.json({
      success: true,
      orderId: result.orderId,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Order creation failed";
    console.error("COD order error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}