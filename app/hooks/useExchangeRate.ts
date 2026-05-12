"use client";
import { useState, useEffect } from "react";

export function useExchangeRate(currency: string) {
  const [aedToBase, setAedToBase] = useState<number | null>(
    currency === "AED" ? 1 : null  // null = still fetching
  );

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