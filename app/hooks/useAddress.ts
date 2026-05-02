"use client";
import { useState } from "react";
import type { CustomerInfo, ShopifyAddress } from "@/types/checkout.types";
import type { NewAddrForm } from "@/types/checkout.types";

interface UseAddressOptions {
  customerId: string;
  initialAddresses: ShopifyAddress[];
  customer: CustomerInfo;
  fetchShippingRates: (addr: CustomerInfo) => Promise<void>;
}

/**
 * Manages the saved-address list and the add-new-address flow.
 * Keeps selectedAddressId and useNewAddress in sync.
 */
export function useAddress({
  customerId,
  initialAddresses,
  customer,
  fetchShippingRates,
}: UseAddressOptions) {
  const [savedAddresses, setSavedAddresses] =
    useState<ShopifyAddress[]>(initialAddresses);

  const defaultAddr =
    savedAddresses.find((a) => a.is_default) ?? savedAddresses[0];

  const [selectedAddressId, setSelectedAddressId] = useState<string>(
    defaultAddr?.id ?? "",
  );
  const [useNewAddress, setUseNewAddress] = useState(false);

  async function handleSaveNewAddress(newAddr: NewAddrForm) {
    const res = await fetch("/api/customer/add-address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, address: newAddr }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to save address");

    const formatted: ShopifyAddress = {
      id: String(data.address.id),
      name: `${newAddr.firstName} ${newAddr.lastName}`.trim(),
      address1: data.address.address1,
      address2: data.address.address2 || "",
      city: data.address.city,
      country: data.address.country,
      phone: data.address.phone || "",
      is_default: false,
    };

    setSavedAddresses((prev) => [...prev, formatted]);
    setSelectedAddressId(formatted.id);

    // Immediately fetch rates for the newly saved address
    await fetchShippingRates({
      ...customer,
      address: formatted.address1,
      city: formatted.city,
      country: formatted.country,
      phone: formatted.phone,
    });
  }

  return {
    savedAddresses,
    defaultAddr,
    selectedAddressId,
    setSelectedAddressId,
    useNewAddress,
    setUseNewAddress,
    handleSaveNewAddress,
  };
}