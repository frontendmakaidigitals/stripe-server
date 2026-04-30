// components/ShippingMethodSection.tsx
"use client";

import { fmt } from "../lib/checkout-utils";
import type { ShippingRate } from "@/types/checkout.types";

type Props = {
  rates: ShippingRate[];
  selectedRate: ShippingRate | null;
  loading: boolean;
  currency: string;
  aedToBase: number;
  onSelect: (rate: ShippingRate) => void;
};

export function ShippingMethodSection({
  rates,
  selectedRate,
  loading,
  currency,
  aedToBase,
  onSelect,
}: Props) {
  return (
    <section className="mb-8 border-t border-b border-gray-300 py-4">
      <p className="text-neutral-600 text-sm mb-3">Shipping method</p>

      {loading ? (
        <p className="text-sm text-gray-400">Fetching shipping rates…</p>
      ) : rates.length === 0 ? (
        <p className="text-sm text-gray-400">
          Enter your address to see shipping options.
        </p>
      ) : (
        <div className="flex flex-col border rounded-md overflow-hidden">
          {rates.map((rate) => {
            const isSelected = selectedRate?.handle === rate.handle;
            return (
              <label
                key={rate.handle}
                className={`flex items-center justify-between gap-4 px-4 py-4 cursor-pointer transition border-b last:border-b-0 ${
                  isSelected ? "bg-[#f0f4ff]" : "bg-white hover:bg-[#fafafa]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="shippingRate"
                    checked={isSelected}
                    onChange={() => onSelect(rate)}
                    className="w-4 h-4 accent-[#1a1a1a]"
                  />
                  <div className="flex flex-col text-sm">
                    <span className="font-medium text-[#1a1a1a]">
                      {rate.title}
                    </span>
                    {rate.estimatedDays && (
                      <span className="text-neutral-500 text-xs mt-0.5">
                        {rate.estimatedDays}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-sm font-semibold shrink-0">
                  {parseFloat(rate.price.amount) === 0
                    ? "FREE"
                    : fmt(parseFloat(rate.price.amount) * aedToBase, currency)}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}