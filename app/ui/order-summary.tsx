// components/OrderSummary.tsx
"use client";
import { useCheckoutContext } from "../checkout/checkoutContext";
import { useState } from "react";
import { fmt } from "../lib/checkout-utils";
import type { ShippingRate } from "@/types/checkout.types";

export function OrderSummary({
  selectedRate,
  ratesLoading,
  onApplyDiscount,
}: {
  selectedRate: ShippingRate | null;
  ratesLoading: boolean;
  onApplyDiscount: (code: string) => Promise<void>;
}) {
  const [discountCode, setDiscountCode] = useState("");
  const [loading, setLoading] = useState(false);

  const { currency, totals, method, discountResult, items, total } =
    useCheckoutContext();

  const { shippingCost, codFee, grandTotal, discountAmount } = totals;

  async function handleApply() {
    if (!discountCode.trim()) return;
    setLoading(true);
    try {
      await onApplyDiscount(discountCode);
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="shrink-0 bg-[#f5f5f5] border-l border-[#e0e0e0] px-8 py-10">
      <div className="max-w-md sticky top-10">
        {/* Items */}
        <div className="flex flex-col gap-5 mb-6">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="relative shrink-0">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.product_title}
                    className="h-16 w-16 rounded-[8px] border border-[#ddd] object-cover bg-white"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-[8px] border border-[#ddd] bg-white flex items-center justify-center text-2xl">
                    🧴
                  </div>
                )}
                <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-md bg-black text-white text-[10px] font-bold flex items-center justify-center">
                  {item.quantity}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#1a1a1a] leading-snug truncate">
                  {item.product_title}
                </p>
              </div>
              <p className="text-sm font-semibold text-[#1a1a1a] shrink-0">
                {fmt(item.price * item.quantity, currency)}
              </p>
            </div>
          ))}
        </div>

        {/* Discount code */}
        <div className="flex gap-2 mb-4">
          <input
            className="flex-1 border-2 border-[#d4d4d4] rounded-md p-4 text-sm bg-white outline-none focus:border-primary transition-colors"
            placeholder="Discount code"
            value={discountCode}
            onChange={(e) => setDiscountCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleApply()}
          />
          <button
            onClick={handleApply}
            disabled={loading || !discountCode.trim()}
            className="border disabled:bg-gray-400 border-[#d4d4d4] rounded-md px-4 py-2.5 text-sm font-medium bg-primary text-white transition-colors"
          >
            {loading ? "…" : "Apply"}
          </button>
        </div>

        {discountResult && (
          <div
            className={`mb-4 text-sm px-3 py-2 rounded-md ${
              discountResult.valid
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-red-50 border border-red-200 text-red-600"
            }`}
          >
            {discountResult.valid
              ? `✓ "${discountResult.code}" applied — ${
                  discountResult.type === "percentage"
                    ? `${discountResult.amount}% off`
                    : fmt(discountResult.amount, currency)
                }`
              : "Invalid or expired discount code"}
          </div>
        )}

        {/* Totals */}
        <div className="border-t border-[#e0e0e0] pt-5 flex flex-col gap-3">
          <div className="flex justify-between text-sm text-[#555]">
            <span>Subtotal</span>
            <span className="font-medium text-[#1a1a1a]">
              {fmt(total, currency)}
            </span>
          </div>

          {discountResult?.valid && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Discount ({discountResult.code})</span>
              <span>− {fmt(discountAmount, currency)}</span>
            </div>
          )}

          {method === "cod" && codFee > 0 && (
            <div className="flex justify-between text-sm text-amber-600">
              <span>COD fee</span>
              <span>+ {fmt(codFee, currency)}</span>
            </div>
          )}

          <div className="flex justify-between text-sm text-[#555]">
            <span>Shipping</span>
            <span className="font-medium text-[#1a1a1a]">
              {ratesLoading
                ? "Calculating…"
                : !selectedRate
                  ? "—"
                  : shippingCost === 0
                    ? "FREE"
                    : fmt(shippingCost, currency)}
            </span>
          </div>

          <div className="flex justify-between items-baseline border-t border-[#e0e0e0] pt-4 mt-1">
            <span className="text-base font-semibold">Total</span>
            <span className="text-2xl font-bold">
              {fmt(grandTotal, currency)}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
