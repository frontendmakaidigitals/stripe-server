"use client";
import { useState, useEffect, useRef } from "react";
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

  // ── Watch only fields needed for shipping-rate re-fetching ──────────────────
  // IMPORTANT: "phone" is intentionally excluded — it is read at submit time
  // via getValues(), not needed for shipping rates, and watching it causes
  // PhoneInput to lose focus on every keystroke because the watch triggers a
  // DeliverySection re-render → AddressForm re-render → PhoneInput remounts.
  const [
    watchedFirstName,
    watchedLastName,
    watchedAddress1,
    watchedCity,
    watchedCountryCode,
  ] = watch(["firstName", "lastName", "address1", "city", "countryCode"]);

  // Use refs to avoid stale closures without adding customer/onCustomerChange
  // to the effect deps (which would cause an infinite re-render loop).
  const onCustomerChangeRef = useRef(onCustomerChange);
  onCustomerChangeRef.current = onCustomerChange;
  const customerRef = useRef(customer);
  customerRef.current = customer;

  useEffect(() => {
    if (!showAddressForm) return;
    onCustomerChangeRef.current({
      ...customerRef.current,
      name:        `${watchedFirstName} ${watchedLastName}`.trim(),
      address:     watchedAddress1,
      city:        watchedCity,
      countryCode: watchedCountryCode,
      country:     watchedCountryCode,
    } as CustomerInfo);
  }, [
    watchedFirstName,
    watchedLastName,
    watchedAddress1,
    watchedCity,
    watchedCountryCode,
    showAddressForm,
  ]);

  // ── Save new address (logged-in flow) ───────────────────────────────────────
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
        firstName:   data.firstName,
        lastName:    data.lastName,
        address1:    data.address1,
        address2:    data.address2,
        city:        data.city,
        countryCode: data.countryCode,
        province:    data.province,
        zip:         data.zip,
        phone:       data.phone,
      });
      setShowAddressForm(false);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Could not save address");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
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
              setShowAddressForm(true);
              onUseNewAddress(true);
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
                ? () => { setShowAddressForm(false); setSaveError(""); }
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