

export interface TabbyRegion {
  currency: string;
  merchantCodeEnv: string; // env var name holding the merchant code
  minAmount: number;       // Tabby minimum order amount in that currency
  maxAmount: number;       // Tabby maximum order amount in that currency
}

export const TABBY_REGIONS: Record<string, TabbyRegion> = {
    AE: {
    currency: "AED",
    merchantCodeEnv: "TABBY_MERCHANT_KEY_AED",   
    minAmount: 1,
    maxAmount: 20000,
  },
  SA: {
    currency: "SAR",
    merchantCodeEnv: "TABBY_MERCHANT_KEY_SAR",  
    minAmount: 1,
    maxAmount: 20000,
  },
  KW: {
    currency: "KWD",
    merchantCodeEnv: "TABBY_MERCHANT_KEY_KWD",   
    minAmount: 1,
    maxAmount: 20000,
  },
};

// Supported Tabby currencies (for quick lookup)
export const TABBY_SUPPORTED_CURRENCIES = new Set(
  Object.values(TABBY_REGIONS).map((r) => r.currency)
);

/**
 * Resolve region config from a currency code or country code.
 * Priority: currency → country code
 */
export function getTabbyRegion(
  currency: string,
  countryCode?: string
): TabbyRegion | null {
  // Match by currency first
  const byCurrency = Object.values(TABBY_REGIONS).find(
    (r) => r.currency === currency.toUpperCase()
  );
  if (byCurrency) return byCurrency;

  // Fallback: match by country code
  if (countryCode) {
    const byCountry = TABBY_REGIONS[countryCode.toUpperCase()];
    if (byCountry) return byCountry;
  }

  return null;
}

/**
 * Get the merchant code for a given region from env vars.
 * Falls back to the generic TABBY_MERCHANT_CODE if region-specific one is missing.
 */
export function getMerchantCode(region: TabbyRegion): string {
  return (
    process.env[region.merchantCodeEnv] ||
    process.env.TABBY_MERCHANT_KEY || ""
  );
}

/**
 * Check whether Tabby is available for a given amount + currency.
 */
export function isTabbyAvailable(amount: number, currency: string): boolean {
  const region = getTabbyRegion(currency);
  if (!region) return false;
  return amount >= region.minAmount && amount <= region.maxAmount;
}