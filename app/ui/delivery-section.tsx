"use client";
import { useState, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import type { CustomerInfo, ShopifyAddress } from "@/types/checkout.types";
import type { NewAddrForm } from "@/types/checkout.types";
import { AddressForm } from "./address-form";

type Props = {
  isLoggedIn: boolean;
  hasAddresses: boolean;
  savedAddresses: ShopifyAddress[];
  defaultAddr: ShopifyAddress | undefined;
  selectedAddressId: string;
  customer: CustomerInfo;
  onSelectAddress: (id: string) => void;
  onCustomerChange: (c: CustomerInfo) => void;
  onSaveNewAddress: (addr: NewAddrForm) => Promise<void>;
  useNewAddress: boolean;
  onUseNewAddress: (v: boolean) => void;
  onRequiredChange?: (flags: {
    provinceRequired: boolean;
    zipRequired: boolean;
  }) => void;
};

export function DeliverySection({
  isLoggedIn,
  hasAddresses,
  savedAddresses,
  defaultAddr,
  selectedAddressId,
  customer,
  onSelectAddress,
  onCustomerChange,
  onSaveNewAddress,
  onRequiredChange,
  onUseNewAddress,
}: Props) {
  const { getValues, watch } = useFormContext();
  const [showAddressForm, setShowAddressForm] = useState(
    !isLoggedIn || !hasAddresses,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const showSavedAddresses = isLoggedIn && hasAddresses && !showAddressForm;

  // Keep customer in sync with RHF values for shipping rate fetching
  const countryCode = watch("countryCode");
  const city = watch("city");
  const address1 = watch("address1");
  const phone = watch("phone");
  const firstName = watch("firstName");
  const lastName = watch("lastName");

  // Sync to customer whenever RHF values change (for shipping rates)
  useEffect(() => {
  if (!showAddressForm) return;
  onCustomerChange({
    ...customer,
    name: `${firstName} ${lastName}`.trim(),
    address: address1,
    city,
    countryCode,
    country: countryCode,
    // ← phone intentionally excluded here
  } as CustomerInfo);
}, [
  firstName,
  lastName,
  address1,
  city,
  countryCode,
  showAddressForm,
  // ← phone removed from deps
  ]);
  async function handleSave() {
    const data = getValues();
    if (!data.firstName || !data.address1 || !data.city) {
      setSaveError("Please fill in first name, address, and city.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await onSaveNewAddress({
        firstName: data.firstName,
        lastName: data.lastName,
        address1: data.address1,
        address2: data.address2,
        city: data.city,
        countryCode: data.countryCode,
        province: data.province,
        zip: data.zip,
        phone: data.phone,
      });
      setShowAddressForm(false);
    } catch (err: unknown) {
      setSaveError(
        err instanceof Error ? err.message : "Could not save address",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-8">
      <h2 className="text-sm text-gray-600 mb-4">Ship to</h2>

      {/* ── Saved address list ── */}
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
            onClick={() => {
              setShowAddressForm(true); // ← was false, should be true
              onUseNewAddress(true); // ← was false, should be true
              setSaveError("");
            }}
            className="text-sm text-[#1a6cff] hover:underline flex items-center gap-1"
          >
            + Add a new address
          </button>
        </>
      )}

      {/* ── Address form ── */}
      {showAddressForm && (
        <>
          {isLoggedIn && hasAddresses && (
            <button
              type="button"
              onClick={() => {
                setShowAddressForm(false);
                setSaveError("");
              }}
              className="text-sm text-[#1a6cff] hover:underline mb-3 flex items-center gap-1"
            >
              ← Use saved address
            </button>
          )}

          <AddressForm
            onSave={isLoggedIn && hasAddresses ? handleSave : undefined}
            onCancel={
              isLoggedIn && hasAddresses
                ? () => {
                    setShowAddressForm(false);
                    setSaveError("");
                  }
                : undefined
            }
            saving={saving}
            saveError={saveError}
            onRequiredChange={onRequiredChange}
          />
        </>
      )}
    </section>
  );
}
