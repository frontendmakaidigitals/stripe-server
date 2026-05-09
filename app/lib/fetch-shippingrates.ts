// lib/fetchShippingRates.ts
import type { CustomerInfo, CartItem } from "@/types/checkout.types";
import type { ShippingRate } from "@/types/checkout.types";
import { toCountryCode } from "./checkout-utils";

export async function fetchShippingRates(
  addr: CustomerInfo,
  {
    currency,
    total,
    aedToBase,
    items,
  }: {
    currency: string;
    total: number;
    aedToBase: number;
    items: CartItem[];
  }
): Promise<ShippingRate[]> {
  if (!addr.city || !addr.country) return [];
  if (currency !== "AED" && (!aedToBase || aedToBase === 0)) return [];

  const countryCode = toCountryCode(addr.country);
  const res = await fetch("/api/shipping/rates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address: {
        address1: addr.address,
        city: addr.city,
        country: countryCode,
        phone: addr.phone,
        currency,
        subtotalAED: currency === "AED" ? total : total / aedToBase,
        lineItems: items.map((i) => ({
          variantId: i.variant_id,
          quantity: i.quantity,
        })),
      },
    }),
  });
  const data = await res.json();
  return data.rates ?? [];
}