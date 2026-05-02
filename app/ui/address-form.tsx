"use client";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormContext, Controller } from "react-hook-form";
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
import { GCC_COUNTRIES } from "../lib/checkout-utils";
import { PhoneInput } from "@/components/ui/phone-input";
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
  optionalLabels: { address2: string | null };
  formatting: { edit: string; show: string };
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
  onSave?: () => void;
  onCancel?: () => void;
  saving?: boolean;
  saveError?: string;
  onRequiredChange?: (flags: {
    provinceRequired: boolean;
    zipRequired: boolean;
  }) => void;
};

export function AddressForm({
  onSave,
  onCancel,
  saving,
  saveError,
  onRequiredChange,
}: Props) {
  const {
    register,
    control,
    watch,
    formState: { errors },
  } = useFormContext();
  const [countryData, setCountryData] = useState<CountryData | null>(null);
  const [loadingCountry, setLoadingCountry] = useState(false);

  const countryCode = watch("countryCode");

  useEffect(() => {
    if (!countryCode) return;
    setLoadingCountry(true);
    formatter
      .getCountry(countryCode)
      .then((data: any) => {
        setCountryData(data);
        onRequiredChange?.({
          provinceRequired: (data.zones ?? []).length > 0,
          zipRequired: parseFields(data.formatting?.edit ?? "").includes("zip"),
        });
      })
      .catch(() => setCountryData(null))
      .finally(() => setLoadingCountry(false));
  }, [countryCode]);

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
      <Controller
        name="countryCode"
        control={control}
        render={({ field, fieldState }) => (
          <div>
            <Combobox
              items={countries}
              value={countriesLib.getName(field.value, "en") ?? field.value}
              onValueChange={(v: any) => {
                const name = typeof v === "object" && v?.name ? v.name : v;
                const code = countriesLib.getAlpha2Code(name, "en") ?? name;
                field.onChange(code);
              }}
            >
              <ComboboxInput
                placeholder="Select country..."
                className={`w-full rounded-sm! border bg-white h-11.5! text-sm outline-none focus:border-[#1a1a1a] ${
                  fieldState.error
                    ? "border-red-400! bg-red-50!"
                    : "border-gray-300"
                }`}
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
            {fieldState.error && (
              <p className="text-xs text-red-500 mt-1">
                {fieldState.error.message}
              </p>
            )}
          </div>
        )}
      />

      {/* ── First / Last name ── */}
      <div>
        <div className="flex gap-3">
          <input
            {...register("firstName")}
            className={`${INPUT} ${errors.firstName ? "border-red-400! bg-red-50!" : ""}`}
            placeholder={labels?.firstName ?? "First name"}
          />
          <input
            {...register("lastName")}
            className={INPUT}
            placeholder={labels?.lastName ?? "Last name"}
          />
        </div>
      </div>

      {/* ── Address 1 ── */}
      <div>
        <input
          {...register("address1")}
          className={`${INPUT} ${errors.address1 ? "border-red-400! bg-red-50!" : ""}`}
          placeholder={labels?.address1 ?? "Address"}
        />
      </div>

      {/* ── Address 2 ── */}
      {shows("address2") && (
        <input
          {...register("address2")}
          className={INPUT}
          placeholder={`${labels?.address2 ?? "Apartment, suite, unit"}${isOptional("address2") ? " (optional)" : ""}`}
        />
      )}

      {/* ── City + Province row ── */}
      {(showCity || showProvince) && (
        <div>
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_.8fr] gap-3">
            {showCity && (
              <input
                {...register("city")}
                className={`${INPUT} ${errors.city ? "border-red-400! bg-red-50!" : ""}`}
                placeholder={labels?.city ?? "City"}
              />
            )}

            {showProvince &&
              (loadingCountry ? (
                <Skeleton
                  className={`h-[46px] ${showCityAndProvince ? "flex-1" : "w-full"} rounded-[6px]`}
                />
              ) : hasProvinces ? (
                <Controller
                  name="province"
                  control={control}
                  render={({ field, fieldState }) => (
                    <div className="">
                      <Combobox
                        items={provinces}
                        value={
                          provinces.find((p) => p.code === field.value)?.name ??
                          ""
                        }
                        onValueChange={(v: any) => {
                          const name =
                            typeof v === "object" && v?.name ? v.name : v;
                          const province = provinces.find(
                            (p) => p.name === name,
                          );
                          field.onChange(province?.code ?? name);
                        }}
                      >
                        <ComboboxInput
                          placeholder={zoneLabel}
                          className={`w-full rounded-sm! border bg-white h-11.5! text-sm outline-none focus:border-[#1a1a1a] ${
                            fieldState.error
                              ? "border-red-400! bg-red-50!"
                              : "border-gray-300"
                          }`}
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
                  )}
                />
              ) : null)}

            {shows("zip") && (
              <div className={`${hasProvinces ? "col-span-2" : "col-span-1"}`}>
                <input
                  {...register("zip")}
                  className={`${INPUT} ${errors.zip ? "border-red-400! bg-red-50!" : ""}`}
                  placeholder={
                    isOptional("zip") ? `${zipLabel} (optional)` : zipLabel
                  }
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ZIP ── */}

      {/* ── Phone ── */}
      {shows("phone") && (
        <Controller
          name="phone"
          control={control}
          render={({ field, fieldState }) => (
            <div>
              <PhoneInput
                placeholder={labels?.phone ?? "Phone"}
                type="tel"
                value={field.value}
                onChange={field.onChange}
                error={!!fieldState.error}
              />
            </div>
          )}
        />
      )}

      {saveError && <p className="text-xs text-red-500">{saveError}</p>}

      {onSave && onCancel && (
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
      )}
    </div>
  );
}
