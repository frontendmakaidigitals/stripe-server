"use client";
import { useState, useEffect } from "react";

/**
 * Fetches the AED → base-currency exchange rate.
 * Returns 1 immediately for AED (no conversion needed).
 */
export function useExchangeRate(currency: string) {
  const [aedToBase, setAedToBase] = useState<number>(1);

  useEffect(() => {
    if (currency === "AED") {
      setAedToBase(1);
      return;
    }
    fetch(`/api/exchange-rate?from=AED&to=${currency}`)
      .then((r) => r.json())
      .then((d) => setAedToBase(d.rate ?? 1))
      .catch(() => setAedToBase(1));
  }, [currency]);

  return aedToBase;
}