"use client";
import { useState, useEffect, useCallback } from "react";
import type { CustomerInfo, ShopifyAddress, CartItem, ShippingRate } from "@/types/checkout.types";
import { fetchShippingRates } from "../lib/fetch-shippingrates";

interface UseShippingRatesOptions {
  currency: string;
  total: number;
  aedToBase: number | null;  // ← was number
  items: CartItem[];
  hasAddresses: boolean;
  useNewAddress: boolean;
  selectedAddressId: string;
  savedAddresses: ShopifyAddress[];
  customer: CustomerInfo;
}

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

  const fetchAndSet = useCallback(async (addr: CustomerInfo) => {
    if (aedToBase === null) return;  // ← guard inside too, in case called early
    setRatesLoading(true);
    try {
      const rates = await fetchShippingRates(addr, { currency, total, aedToBase, items });
      setShippingRates(rates);
      setSelectedRate(rates[0] ?? null);
    } finally {
      setRatesLoading(false);
    }
  }, [currency, total, aedToBase, items]);

  useEffect(() => {
    if (aedToBase === null) return;  // ← wait for real rate, prevents double fetch

    if (hasAddresses && !useNewAddress && selectedAddressId) {
      const addr = savedAddresses.find((a) => a.id === selectedAddressId);
      if (addr) {
        fetchAndSet({
          ...customer,
          phone: addr.phone || customer.phone,
          address: [addr.address1, addr.address2].filter(Boolean).join(", "),
          city: addr.city,
          country: addr.country,
        });
      }
    } else {
      fetchAndSet(customer);
    }
  }, [selectedAddressId, useNewAddress, customer.city, customer.country, customer.address, aedToBase, fetchAndSet]);
  //                                                                                                   ^^^ fetchAndSet added (was missing)

  return { shippingRates, selectedRate, setSelectedRate, ratesLoading, fetchShippingRates: fetchAndSet };
}