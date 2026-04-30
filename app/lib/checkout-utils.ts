// checkout.utils.ts
import countriesLib from "i18n-iso-countries";

const CURRENCY_LOCALE: Record<string, string> = {
  USD: "en-US",
  EUR: "de-DE",
  CAD: "en-CA",
  AED: "en-AE",
  SAR: "en-SA",
};

export function fmt(amount: number, currency: string) {
  const locale = CURRENCY_LOCALE[currency] ?? "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number(amount));
}

export function toCountryCode(nameOrCode: string): string {
  if (!nameOrCode) return "";
  if (nameOrCode.length === 2) return nameOrCode.toUpperCase(); // already a code
  return countriesLib.getAlpha2Code(nameOrCode, "en") ?? nameOrCode;
}

export const GCC_COUNTRIES = ["KW", "AE", "BH", "OM", "QA", "SA"];
export const COD_COUNTRIES = ["AE"];
export const COD_FEE_AED = 10;

export function isCODAvailable(country: string | null): boolean {
  if (!country) return false;
  const code = toCountryCode(country);
  return COD_COUNTRIES.includes(code.toUpperCase());
}

 