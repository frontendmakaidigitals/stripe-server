"use client";
import { useState, useEffect, useCallback,useRef } from "react";
import type { CustomerInfo, ShopifyAddress, CartItem, ShippingRate } from "@/types/checkout.types";
import { fetchShippingRates } from "../lib/fetch-shippingrates";

interface UseShippingRatesOptions {
  currency: string;
  total: number;
  aedToBase: number | null;
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
    if (aedToBase === null) return;
    setRatesLoading(true);
    try {
      const rates = await fetchShippingRates(addr, { currency, total, aedToBase, items });
      setShippingRates(rates);
      setSelectedRate(rates[0] ?? null);
    } finally {
      setRatesLoading(false);
    }
  }, [currency, total, aedToBase, items]);

  // Stable customer ref — avoids the effect depending on the whole object
  // while still catching any field change
  const customerRef = useRef(customer);
  useEffect(() => {
    customerRef.current = customer;
  });

  useEffect(() => {
    if (aedToBase === null) return;

    if (hasAddresses && !useNewAddress && selectedAddressId) {
      const addr = savedAddresses.find((a) => a.id === selectedAddressId);
      if (addr) {
        fetchAndSet({
          ...customerRef.current,
          phone: addr.phone || customerRef.current.phone,
          address: [addr.address1, addr.address2].filter(Boolean).join(", "),
          city: addr.city,
          country: addr.country,
        });
      }
    } else {
      fetchAndSet(customerRef.current);
    }
  }, [
    selectedAddressId,
    useNewAddress,
    customer.city,      // ← individual fields still trigger the effect
    customer.country,
    customer.address,
    customer.phone,     // ← was missing
    customer.email,     // ← was missing
    aedToBase,
    fetchAndSet,
    hasAddresses,       // ← was missing
    savedAddresses,     // ← was missing (needed when user adds a new address)
  ]);

  return { shippingRates, selectedRate, setSelectedRate, ratesLoading, fetchShippingRates: fetchAndSet };
}