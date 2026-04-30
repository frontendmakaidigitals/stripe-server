// components/AddressForm.tsx
"use client";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";
import AddressFormatter from "@shopify/address";
import countriesLib from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { GCC_COUNTRIES, toCountryCode } from "../lib/checkout-utils";
import type { NewAddrForm } from "@/types/checkout.types";

countriesLib.registerLocale(en);

type Province = { code: string; name: string };
type CountryData = {
  name: string;
  provinceKey: string | null;
  labels: {
    address1: string;
    address2: string;
    city: string;
    company: string;
    country: string;
    firstName: string;
    lastName: string;
    phone: string;
    postalCode: string;
    zone: string;
  };
  optionalLabels: {
    address2: string | null;
  };
  formatting: {
    edit: string;
    show: string;
  };
  zones: Province[];
};

function parseFields(template: string): string[] {
  const matches = template.match(/\{(\w+)\}/g) ?? [];
  return matches.map((m) => m.replace(/[{}]/g, ""));
}

const formatter = new AddressFormatter("en");

const countries = Object.entries(countriesLib.getNames("en"))
  .filter(([code]) => GCC_COUNTRIES.includes(code))
  .map(([code, name]) => ({ code, name }));

const INPUT =
  "w-full border border-[#d4d4d4] rounded-[6px] px-4 py-3 text-sm outline-none focus:border-[#1a1a1a] transition-colors";

type Props = {
  value: NewAddrForm;
  onChange: (addr: NewAddrForm) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
};

export function AddressForm({
  value,
  onChange,
  onSave,
  onCancel,
  saving,
  error,
}: Props) {
  const [countryData, setCountryData] = useState<CountryData | null>(null);
  const [loadingCountry, setLoadingCountry] = useState(false);

  const set = (patch: Partial<NewAddrForm>) => onChange({ ...value, ...patch });

  useEffect(() => {
    if (!value.countryCode) return;
    setLoadingCountry(true);
    formatter
      .getCountry(value.countryCode)
      .then((data: any) => setCountryData(data))
      .catch(() => setCountryData(null))
      .finally(() => setLoadingCountry(false));
  }, [value.countryCode]);

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
  return (
    <div className="mt-3 flex flex-col gap-3 border border-gray-200 rounded-lg p-4 bg-white">
      <p className="text-sm font-medium text-[#1a1a1a]">New address</p>

      {/* ── Country ── */}
      <Combobox
        items={countries}
        value={
          countriesLib.getName(value.countryCode, "en") ?? value.countryCode
        }
        onValueChange={(v: any) => {
          const name = typeof v === "object" && v?.name ? v.name : v;
          // toCountryCode(name) is broken — replace with direct lookup:
          const code = countriesLib.getAlpha2Code(name, "en") ?? name;
          set({ countryCode: code, province: "", zip: "" });
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
          value={value.firstName}
          onChange={(e) => set({ firstName: e.target.value })}
        />
        <input
          className={INPUT}
          placeholder={labels?.lastName ?? "Last name"}
          value={value.lastName}
          onChange={(e) => set({ lastName: e.target.value })}
        />
      </div>

      {/* ── Address 1 ── */}
      <input
        className={INPUT}
        placeholder={labels?.address1 ?? "Address"}
        value={value.address1}
        onChange={(e) => set({ address1: e.target.value })}
      />

      {/* ── Address 2 — only if in template ── */}
      {shows("address2") && (
        <input
          className={INPUT}
          placeholder={`${labels?.address2 ?? "Apartment, suite, unit"}${isOptional("address2") ? " (optional)" : ""}`}
          value={value.address2 ?? ""}
          onChange={(e) => set({ address2: e.target.value })}
        />
      )}

      {/* ── City + Province row ── */}
      {(showCity || showProvince) && (
        <div className="flex gap-3">
          {showCity && (
            <input
              className={INPUT}
              placeholder={labels?.city ?? "City"}
              value={value.city}
              onChange={(e) => set({ city: e.target.value })}
            />
          )}

          {showProvince &&
            (loadingCountry ? (
              <Skeleton
                className={`h-[20px] ${showCityAndProvince ? "flex-1" : "w-full"} rounded-full`}
              />
            ) : hasProvinces ? (
              <Combobox
                items={provinces}
                value={
                  provinces.find((p) => p.code === (value.province ?? ""))
                    ?.name ?? ""
                }
                onValueChange={(v: any) => {
                  const name = typeof v === "object" && v?.name ? v.name : v;
                  const province = provinces.find((p) => p.name === name);
                  set({ province: province?.code ?? name });
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
            ) : null)}
        </div>
      )}

      {/* ── ZIP / Postal — hidden when not in template (e.g. UAE) ── */}
      {shows("zip") && (
        <input
          className={INPUT}
          placeholder={isOptional("zip") ? `${zipLabel} (optional)` : zipLabel}
          value={value.zip ?? ""}
          onChange={(e) => set({ zip: e.target.value })}
        />
      )}

      {/* ── Phone — only if in template ── */}
      {shows("phone") && (
        <input
          className={INPUT}
          placeholder={labels?.phone ?? "Phone"}
          type="tel"
          value={value.phone}
          onChange={(e) => set({ phone: e.target.value })}
        />
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3 mt-1">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex-1 bg-primary text-white rounded-[6px] py-2.5 text-sm font-semibold disabled:bg-gray-400"
        >
          {saving ? "Saving…" : "Save address"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 border border-gray-300 rounded-[6px] py-2.5 text-sm font-medium text-[#555]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
