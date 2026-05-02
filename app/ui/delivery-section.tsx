// components/DeliverySection.tsx
"use client";
import { useState } from "react";
import type { CustomerInfo, ShopifyAddress } from "@/types/checkout.types";
import type { NewAddrForm } from "@/types/checkout.types";
import { AddressForm } from "./address-form";

type Props = {
  isLoggedIn: boolean;
  hasAddresses: boolean;
  savedAddresses: ShopifyAddress[];
  defaultAddr: ShopifyAddress | undefined;
  selectedAddressId: string;
  useNewAddress: boolean;
  customer: CustomerInfo;
  onSelectAddress: (id: string) => void;
  onUseNewAddress: (v: boolean) => void;
  onCustomerChange: (c: CustomerInfo) => void;
  onSaveNewAddress: (addr: NewAddrForm) => Promise<void>;
  errors?: Record<string, string>;
};

const EMPTY_ADDR: NewAddrForm = {
  firstName: "",
  lastName: "",
  address1: "",
  city: "",
  countryCode: "AE",
  zip: "",
  phone: "",
};

export function DeliverySection({
  isLoggedIn,
  hasAddresses,
  savedAddresses,
  defaultAddr,
  selectedAddressId,
  useNewAddress,
  customer,
  onSelectAddress,
  onUseNewAddress,
  onCustomerChange,
  onSaveNewAddress,
  errors = {},
}: Props) {
  const [showAddressForm, setShowAddressForm] = useState(
    !isLoggedIn || !hasAddresses,
  );
  const [newAddr, setNewAddr] = useState<NewAddrForm>(() => ({
    ...EMPTY_ADDR,
    firstName: customer.name.split(" ")[0] || "",
    lastName: customer.name.split(" ").slice(1).join(" ") || "",
    address1: customer.address || "",
    city: customer.city || "",
    phone: customer.phone || "",
    countryCode: customer.countryCode || "AE",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const showSavedAddresses = isLoggedIn && hasAddresses && !showAddressForm;

  // When AddressForm changes, also sync CustomerInfo so shipping
  // rates and validation stay in sync
  function handleAddrChange(addr: NewAddrForm) {
    setNewAddr(addr);
    onCustomerChange({
      ...customer,
      name: `${addr.firstName} ${addr.lastName}`.trim(),
      address: addr.address1,
      city: addr.city,
      phone: addr.phone,
      countryCode: addr.countryCode,
      country: addr.countryCode,
      // preserve required flags set by the countryData useEffect
      provinceRequired: (customer as any).provinceRequired,
      zipRequired: (customer as any).zipRequired,
      province: addr.province ?? (customer as any).province,
      zip: addr.zip ?? (customer as any).zip,
    } as CustomerInfo);
  }

  async function handleSave() {
    if (!newAddr.firstName || !newAddr.address1 || !newAddr.city) {
      setError("Please fill in first name, address, and city.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSaveNewAddress(newAddr);
      setShowAddressForm(false);
      setNewAddr(EMPTY_ADDR);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save address");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-8">
      <h2 className="text-sm text-gray-600 mb-4">Ship to</h2>

      {/* ── Saved address list (logged-in only) ── */}
      {showSavedAddresses && (
        <>
          <div className="rounded-lg overflow-hidden divide-y divide-sky-100 mb-3">
            {savedAddresses.map((addr: ShopifyAddress) => (
              <label
                key={addr.id}
                className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                  selectedAddressId === addr.id
                    ? "bg-indigo-500/8"
                    : "bg-white hover:bg-[#fafafa]"
                }`}
              >
                <input
                  type="radio"
                  name="address"
                  value={addr.id}
                  checked={selectedAddressId === addr.id}
                  onChange={() => onSelectAddress(addr.id)}
                  className="mt-1 w-4 h-4 accent-[#1a1a1a]"
                />
                <div className="flex-1">
                  <p className="text-sm text-gray-800 mt-0.5">
                    {[addr.address1, addr.address2].filter(Boolean).join(", ")}
                  </p>
                  <p className="text-sm text-[#666]">
                    {addr.city}, {addr.country}
                  </p>
                  {addr.id === defaultAddr?.id && (
                    <span className="text-xs bg-stone-500 text-gray-50 px-2 py-1 rounded-full font-semibold tracking-wide">
                      Default
                    </span>
                  )}
                </div>
              </label>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowAddressForm(true)}
            className="text-sm text-[#1a6cff] hover:underline flex items-center gap-1"
          >
            + Add a new address
          </button>
        </>
      )}

      {/* ── Address form — guests always, logged-in when adding new ── */}
      {showAddressForm && (
        <>
          {/* Back button for logged-in users who clicked "Add new address" */}
          {isLoggedIn && hasAddresses && (
            <button
              type="button"
              onClick={() => {
                setShowAddressForm(false);
                setError("");
              }}
              className="text-sm text-[#1a6cff] hover:underline mb-3 flex items-center gap-1"
            >
              ← Use saved address
            </button>
          )}

          <AddressForm
            value={newAddr}
            onChange={handleAddrChange}
            onSave={isLoggedIn && hasAddresses ? handleSave : undefined}
            onCancel={
              isLoggedIn && hasAddresses
                ? () => {
                    setShowAddressForm(false);
                    setError("");
                  }
                : undefined
            }
            saving={saving}
            error={error}
            errors={errors}
          />
        </>
      )}
    </section>
  );
}
