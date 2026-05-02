"use client";
import { useState, useEffect } from "react";
import type { CustomerInfo, ShopifyAddress } from "@/types/checkout.types";
import type { ShippingRate } from "@/types/checkout.types";
import { toCountryCode } from "../lib/checkout-utils";
import { CartItem } from "@/types/checkout.types";
type LineItem = { variant_id: string | undefined; quantity: number };

interface UseShippingRatesOptions {
  currency: string;
  total: number;
  aedToBase: number;
  items: CartItem[];
  // Address state
  hasAddresses: boolean;
  useNewAddress: boolean;
  selectedAddressId: string;
  savedAddresses: ShopifyAddress[];
  customer: CustomerInfo;
}

/**
 * Fetches shipping rates whenever the delivery address or exchange rate changes.
 * Exposes rates, the currently selected rate, a loading flag, and a setter.
 */
export function useShippingRates({
  currency,
  total,
  aedToBase,
  items,
  hasAddresses,
  useNewAddress,
  selectedAddressId,
  savedAddresses,
  customer,
}: UseShippingRatesOptions) {
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [selectedRate, setSelectedRate] = useState<ShippingRate | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);

  async function fetchShippingRates(addr: CustomerInfo) {
    if (!addr.city || !addr.country) return;
    if (currency !== "AED" && aedToBase === 1) return;

    const countryCode = toCountryCode(addr.country);
    setRatesLoading(true);
    try {
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
      setShippingRates(data.rates ?? []);
      setSelectedRate(data.rates?.[0] ?? null);
    } finally {
      setRatesLoading(false);
    }
  }

  // Re-fetch when address selection or customer location changes
  useEffect(() => {
    if (hasAddresses && !useNewAddress && selectedAddressId) {
      const addr = savedAddresses.find((a) => a.id === selectedAddressId);
      if (addr) {
        fetchShippingRates({
          ...customer,
          phone: addr.phone || customer.phone,
          address: [addr.address1, addr.address2].filter(Boolean).join(", "),
          city: addr.city,
          country: addr.country,
        });
      }
    } else {
      fetchShippingRates(customer);
    }
  }, [
    selectedAddressId,
    useNewAddress,
    customer.city,
    customer.country,
    customer.address,
    aedToBase,
  ]);

  return {
    shippingRates,
    selectedRate,
    setSelectedRate,
    ratesLoading,
    fetchShippingRates,
  };
}