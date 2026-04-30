// components/DeliverySection.tsx
"use client";
import { PhoneInput } from "@/components/ui/phone-input";
import { useState, useEffect } from "react";
import countriesLib from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";
import { Skeleton } from "@/components/ui/skeleton";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import AddressFormatter from "@shopify/address";
import { AddressForm } from "./address-form";
import { GCC_COUNTRIES, toCountryCode } from "../lib/checkout-utils";
import type { CustomerInfo, ShopifyAddress } from "@/types//checkout.types";
import { NewAddrForm } from "@/types/checkout.types";

countriesLib.registerLocale(en);

const formatter = new AddressFormatter("en");

type Province = { code: string; name: string };
type CountryData = {
  labels: {
    address1: string;
    address2: string;
    city: string;
    firstName: string;
    lastName: string;
    phone: string;
    postalCode: string;
    zone: string;
  };
  optionalLabels: { address2: string | null };
  formatting: { edit: string };
  zones: Province[];
};

function parseFields(template: string): string[] {
  return (template.match(/\{(\w+)\}/g) ?? []).map((m) =>
    m.replace(/[{}]/g, ""),
  );
}

const countries = Object.entries(countriesLib.getNames("en"))
  .filter(([code]) => GCC_COUNTRIES.includes(code))
  .map(([code, name]) => ({ code, name }));

const INPUT =
  "w-full border border-[#d4d4d4] rounded-[6px] px-4 py-3 text-sm outline-none focus:border-[#1a1a1a] transition-colors";

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
}: Props) {
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [newAddr, setNewAddr] = useState<NewAddrForm>(EMPTY_ADDR);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Country data for the guest form
  const [countryData, setCountryData] = useState<CountryData | null>(null);
  const [loadingCountry, setLoadingCountry] = useState(false);

  // Derive countryCode from customer.country name
  const guestCountryCode = customer.countryCode || "AE";

  // Sync guest form's country → load country data
  useEffect(() => {
    if (!guestCountryCode) return;
    setLoadingCountry(true);
    formatter
      .getCountry(guestCountryCode)
      .then((data: any) => setCountryData(data))
      .catch(() => setCountryData(null))
      .finally(() => setLoadingCountry(false));
  }, [guestCountryCode]);

  const editTemplate = countryData?.formatting?.edit ?? "";
  const visibleFields = parseFields(editTemplate);
  const optionalFields = Object.entries(countryData?.optionalLabels ?? {})
    .filter(([, v]) => v !== null)
    .map(([k]) => k);

  const labels = countryData?.labels;
  const provinces = countryData?.zones ?? [];
  const hasProvinces = provinces.length > 0;
  const zoneLabel = labels?.zone ?? "State / Province";
  const zipLabel = labels?.postalCode ?? "Postal code";

  const shows = (field: string) =>
    !countryData || loadingCountry || visibleFields.includes(field);
  const isOptional = (field: string) => optionalFields.includes(field);

  const showCity = shows("city");
  const showProvince = shows("province") && (loadingCountry || hasProvinces);
  const showCityAndProvince = showCity && showProvince;

  // Guest customer province field (stored separately since CustomerInfo may not have it)
  const guestProvince = (customer as any).province ?? "";
  const setCustomer = (patch: Partial<CustomerInfo & { province: string }>) =>
    onCustomerChange({ ...customer, ...patch } as CustomerInfo);

  async function handleSave() {
    if (!newAddr.address1 || !newAddr.city || !newAddr.countryCode) {
      setError("Please fill in address, city, and country.");
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

  const showSavedAddresses = isLoggedIn && hasAddresses && !useNewAddress;
  const showGuestForm = !isLoggedIn || !hasAddresses || useNewAddress;

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

          {!showAddressForm ? (
            <button
              type="button"
              onClick={() => setShowAddressForm(true)}
              className="text-sm text-[#1a6cff] hover:underline flex items-center gap-1"
            >
              + Add a new address
            </button>
          ) : (
            <AddressForm
              value={newAddr}
              onChange={setNewAddr}
              onSave={handleSave}
              onCancel={() => {
                setShowAddressForm(false);
                setError("");
              }}
              saving={saving}
              error={error}
            />
          )}
        </>
      )}

      {/* ── Guest / new address form ── */}
      {showGuestForm && (
        <div className="flex flex-col gap-3">
          {useNewAddress && (
            <button
              type="button"
              onClick={() => onUseNewAddress(false)}
              className="text-sm text-[#1a6cff] hover:underline self-start mb-1"
            >
              ← Use saved address
            </button>
          )}

          {/* ── Country ── */}
          <Combobox
            items={countries}
            value={
              countriesLib.getName(customer.countryCode, "en") ??
              customer.countryCode
            }
            onValueChange={(value: any) => {
              const name =
                typeof value === "object" && value?.name ? value.name : value;
              const code = countriesLib.getAlpha2Code(name, "en") ?? name;
              setCustomer({ countryCode: code, country: name, province: "" });
            }}
          >
            <ComboboxInput
              placeholder="Select country..."
              className="w-full rounded-sm! border bg-white border-gray-300 h-11.5! text-sm outline-none focus:border-[#1a1a1a]"
            />
            <ComboboxContent className="rounded-md! max-h-72">
              <ComboboxEmpty>No country found.</ComboboxEmpty>
              <ComboboxList>
                {(item) => (
                  <ComboboxItem
                    value={item.name}
                    key={item.code}
                    className="rounded-md! py-3"
                  >
                    {item.name}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>

          {/* ── First / Last name ── */}
          <div className="flex gap-3">
            <input
              className={INPUT}
              placeholder={labels?.firstName ?? "First name"}
              value={customer.name.split(" ")[0] || ""}
              onChange={(e) =>
                setCustomer({
                  name:
                    e.target.value +
                    " " +
                    customer.name.split(" ").slice(1).join(" "),
                })
              }
            />
            <input
              className={INPUT}
              placeholder={labels?.lastName ?? "Last name (optional)"}
              value={customer.name.split(" ").slice(1).join(" ") || ""}
              onChange={(e) =>
                setCustomer({
                  name: customer.name.split(" ")[0] + " " + e.target.value,
                })
              }
            />
          </div>

          {/* ── Address 1 ── */}
          <input
            className={INPUT}
            placeholder={labels?.address1 ?? "Address"}
            value={customer.address}
            onChange={(e) => setCustomer({ address: e.target.value })}
          />

          {/* ── Address 2 — only if in template ── */}
          {shows("address2") && (
            <input
              className={INPUT}
              placeholder={`${labels?.address2 ?? "Apartment, suite, unit"}${isOptional("address2") ? " (optional)" : ""}`}
              value={(customer as any).address2 ?? ""}
              onChange={(e) => setCustomer({ address2: e.target.value } as any)}
            />
          )}

          {/* ── City + Province row ── */}
          {(showCity || showProvince) && (
            <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_.8fr] gap-3">
              {showCity && (
                <input
                  className={INPUT}
                  placeholder={labels?.city ?? "City"}
                  value={customer.city}
                  onChange={(e) => setCustomer({ city: e.target.value })}
                />
              )}

              {showProvince &&
                (loadingCountry ? (
                  <Skeleton
                    className={`h-11 ${showCityAndProvince ? "flex-1" : "w-full"} rounded-full`}
                  />
                ) : hasProvinces ? (
                  <div className={showCityAndProvince ? "flex-1" : "w-full"}>
                    <Combobox
                      items={provinces}
                      value={
                        provinces.find((p) => p.code === guestProvince)?.name ??
                        ""
                      }
                      onValueChange={(value: any) => {
                        const name =
                          typeof value === "object" && value?.name
                            ? value.name
                            : value;
                        const province = provinces.find((p) => p.name === name);
                        setCustomer({ province: province?.code ?? name });
                      }}
                    >
                      <ComboboxInput
                        placeholder={zoneLabel}
                        className="w-full rounded-sm! border bg-white border-gray-300 h-11.5! text-sm outline-none focus:border-[#1a1a1a]"
                      />
                      <ComboboxContent className="rounded-md! max-h-72">
                        <ComboboxEmpty>
                          No {zoneLabel.toLowerCase()} found.
                        </ComboboxEmpty>
                        <ComboboxList>
                          {(item) => (
                            <ComboboxItem
                              value={item.name}
                              key={item.code}
                              className="rounded-md! py-3"
                            >
                              {item.name}
                            </ComboboxItem>
                          )}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                  </div>
                ) : null)}
              {shows("zip") && (
                <input
                  className={`${INPUT} ${hasProvinces ? "col-span-2" : ""}`}
                  placeholder={
                    isOptional("zip") ? `${zipLabel} (optional)` : zipLabel
                  }
                  value={(customer as any).zip ?? ""}
                  onChange={(e) => setCustomer({ zip: e.target.value } as any)}
                />
              )}
            </div>
          )}

          {/* ── ZIP — hidden when not in template (e.g. UAE) ── */}

          {/* ── Phone ── */}
          {shows("phone") && (
            <PhoneInput
              className={``}
              placeholder={labels?.phone ?? "Phone"}
              type="tel"
              value={customer.phone}
              onChange={(e) => setCustomer({ phone: e })}
            />
          )}

          {!isLoggedIn && (
            <label className="flex items-center gap-2 mt-1 text-sm text-[#555] cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded" />
              Save this information for next time
            </label>
          )}
        </div>
      )}
    </section>
  );
}
