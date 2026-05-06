import { markTokenUsed } from "@/app/lib/used-tokens";
import { NextRequest, NextResponse } from "next/server";
import type { CartItem, CustomerInfo } from "@/types/checkout.types";

interface CODRequest {
  items: CartItem[];
  currency: string;
  customer: CustomerInfo;
  token?: string;
  shipping?: number;
  shippingHandle?: string;
  codFee?: number;
  discountCode?: string;
  discountAmount?: number;
  discountType?: string | null;
}

async function createShopifyOrder(
  items: CartItem[],
  customer: CustomerInfo,
  currency: string,
  codFee: number = 0,
  discountCode?: string,
  shipping: number = 0,
  shippingHandle: string = "Shipping",
) {
  const domain = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
  const token = process.env.SHOPIFY_ACCESS_TOKEN!;

  const [firstName, ...rest] = customer.name.trim().split(" ");
  const lastName = rest.join(" ") || "-";

  const address = {
    first_name: firstName,
    last_name: lastName,
    address1: customer.address,
    city: customer.city,
    country: customer.country || "AE",
    phone: customer.phone,
  };

  const isUAE =
    customer.country?.trim().toLowerCase() === "united arab emirates" ||
    customer.country?.trim().toUpperCase() === "AE";

  // Use variant_id for inventory tracking but force price via applied_discount
  const lineItems: object[] = items.map((item) => {
    const basePrice = item.base_price ?? item.price;  
    const targetPrice = item.price;                   
    const diff = parseFloat((basePrice - targetPrice).toFixed(2));
    const hasDiff = Math.abs(diff) >= 0.01;

    const lineItem: Record<string, unknown> = {
      variant_id: item.variant_id
        ? parseInt(item.variant_id, 10)
        : undefined,
      title: item.variant_id ? undefined : item.product_title,
      price: item.variant_id ? undefined : targetPrice.toFixed(2),
      quantity: item.quantity,
      requires_shipping: true,
      taxable: isUAE,
    };

    // Remove undefined keys
    Object.keys(lineItem).forEach(
      (k) => lineItem[k] === undefined && delete lineItem[k],
    );

    // Apply discount to adjust price if needed
    if (item.variant_id && hasDiff && diff > 0) {
      lineItem.applied_discount = {
        value_type: "fixed_amount",
        value: (diff * item.quantity).toFixed(2),
        title: "Price adjustment",
        amount: (diff * item.quantity).toFixed(2),
      };
    }

    return lineItem;
  });

  // COD fee as non-taxable line item
  if (codFee > 0) {
    lineItems.push({
      title: "COD (incl. VAT)",
      price: codFee.toFixed(2),
      quantity: 1,
      requires_shipping: false,
      taxable: false,
    });
  }

  const draftRes = await fetch(
    `https://${domain}/admin/api/2024-01/draft_orders.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        draft_order: {
          line_items: lineItems,
          email: customer.email,
          shipping_address: address,
          billing_address: address,
          tax_exempt: !isUAE, // non-UAE orders: no VAT
          note: `COD order — phone: ${customer.phone}${codFee > 0 ? ` | COD fee: ${codFee.toFixed(2)} ${currency}` : ""}`,
          tags: "COD, custom-checkout",
          send_receipt: false,
          ...(shipping > 0
            ? {
                shipping_line: {
                  title: shippingHandle,
                  price: shipping.toFixed(2),
                },
              }
            : {}),
          ...(discountCode
            ? {
                applied_discount: {
                  value_type: "percentage",
                  value: "0",
                  title: discountCode,
                  description: discountCode,
                  application_type: "discount_code",
                },
              }
            : {}),
        },
      }),
    },
  );

  if (!draftRes.ok) {
    const err = await draftRes.text();
    console.error("Shopify draft order error:", err);
    throw new Error(`Shopify error: ${draftRes.status}`);
  }

  const draftJson = await draftRes.json();
  console.log("[COD] Shopify draft order totals:", {
    total_price:    draftJson.draft_order?.total_price,
    subtotal_price: draftJson.draft_order?.subtotal_price,
    total_tax:      draftJson.draft_order?.total_tax,
    applied_discount: draftJson.draft_order?.applied_discount,
  });

  const draft = draftJson.draft_order;

  const completeRes = await fetch(
    `https://${domain}/admin/api/2024-01/draft_orders/${draft.id}/complete.json?payment_pending=true`,
    {
      method: "PUT",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
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
    shipping > 0 ? `shipping=${shipping.toFixed(2)}` : "",
    `isUAE=${isUAE}`,
  );

  return { orderId: completed.name, numericId: completed.id };
}

export async function POST(request: NextRequest) {
  try {
    const body: CODRequest = await request.json();
    const {
      items,
      currency = "AED",
      customer,
      codFee = 0,
      discountCode,
      shipping = 0,
      shippingHandle = "Shipping",
    } = body;

    if (!items?.length) {
      return NextResponse.json({ error: "No items in cart" }, { status: 400 });
    }
    if (
      !customer?.name ||
      !customer?.email ||
      !customer?.phone ||
      !customer?.address ||
      !customer?.city
    ) {
      return NextResponse.json(
        { error: "Missing customer details" },
        { status: 400 },
      );
    }

    const result = await createShopifyOrder(
      items,
      customer,
      currency,
      codFee,
      discountCode,
      shipping,
      shippingHandle,
    );

    const token = request.headers.get("x-checkout-token") || body.token;
    if (token) markTokenUsed(token);

    return NextResponse.json({ success: true, orderId: result.orderId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Order creation failed";
    console.error("COD order error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}