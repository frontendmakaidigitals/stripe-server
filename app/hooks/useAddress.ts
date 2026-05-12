"use client";
import { useState } from "react";
import type { CustomerInfo, ShopifyAddress } from "@/types/checkout.types";
import type { NewAddrForm } from "@/types/checkout.types";

interface UseAddressOptions {
  customerId: string;
  initialAddresses: ShopifyAddress[];
  customer: CustomerInfo;
  // ← fetchShippingRates removed entirely
}

export function useAddress({
  customerId,
  initialAddresses,
  customer,
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
    // ← no fetchShippingRates call here anymore
    // useShippingRates reacts to selectedAddressId changing automatically
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