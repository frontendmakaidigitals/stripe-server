// components/OrderSummary.tsx
"use client";
import { useCheckoutContext } from "../checkout/checkoutContext";
import { useState } from "react";
import { fmt } from "../lib/checkout-utils";
import type { ShippingRate } from "@/types/checkout.types";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
const VAT_RATE = 0.05;
const VAT_DIVISOR = 1 + VAT_RATE; // 1.05

export function OrderSummary({
  selectedRate,
  ratesLoading,
  onApplyDiscount,
  discountLoading,
}: {
  selectedRate: ShippingRate | null;
  ratesLoading: boolean;
  onApplyDiscount: (code: string) => Promise<void>;
  discountLoading: boolean;
}) {
  const [discountCode, setDiscountCode] = useState("");
  const { currency, totals, method, discountResult, items, total, customer } =
    useCheckoutContext();

  const { shippingCost, codFee, grandTotal, discountAmount } = totals;
  const isUAE =
    customer?.country?.trim().toLowerCase() === "united arab emirates" ||
    customer?.country?.trim().toUpperCase() === "AE";

  const subtotalExclVAT = isUAE
    ? Math.round((total / VAT_DIVISOR) * 100) / 100
    : total;

  const codFeeExclVAT = isUAE
    ? Math.round((codFee / VAT_DIVISOR) * 100) / 100
    : codFee;

  const shippingExclVAT = isUAE
    ? Math.round((shippingCost / VAT_DIVISOR) * 100) / 100
    : shippingCost;

  // Discount computed from ex-VAT subtotal directly
  const discountExclVAT = discountResult?.valid
    ? discountResult.type === "percentage"
      ? Math.round(subtotalExclVAT * (discountResult.amount / 100) * 100) / 100
      : isUAE
        ? Math.round((discountResult.amount / VAT_DIVISOR) * 100) / 100
        : discountResult.amount
    : 0;

  // VAT per line
  const vatOnSubtotal = isUAE
    ? Math.round((total - subtotalExclVAT) * 100) / 100
    : 0;
  const vatOnCod = isUAE ? Math.round((codFee - codFeeExclVAT) * 100) / 100 : 0;
  const vatOnShipping = isUAE
    ? Math.round((shippingCost - shippingExclVAT) * 100) / 100
    : 0;
  const vatOnDiscount = isUAE
    ? Math.round(discountExclVAT * VAT_RATE * 100) / 100
    : 0;

  const totalVAT = isUAE
    ? Math.round(
        (vatOnSubtotal - vatOnDiscount + vatOnCod + vatOnShipping) * 100,
      ) / 100
    : 0;

  const finalTotal = isUAE
    ? Math.round(
        (subtotalExclVAT -
          discountExclVAT +
          codFeeExclVAT +
          shippingExclVAT +
          totalVAT) *
          100,
      ) / 100
    : grandTotal;

  async function handleApply() {
    if (!discountCode.trim()) return;
    try {
      await onApplyDiscount(discountCode);
      setDiscountCode("");
    } catch (error) {
      console.error(error);
    } finally {
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
            className="flex-1 border-2 border-[#d4d4d4] rounded-md p-3 text-sm bg-white outline-none focus:border-primary transition-colors"
            placeholder="Discount code"
            value={discountCode}
            onChange={(e) => setDiscountCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleApply()}
          />
          <button
            onClick={handleApply}
            disabled={discountLoading || !discountCode.trim()}
            className="border disabled:bg-neutral-300 flex justify-center items-center rounded-md w-18 py-2.5 text-sm font-medium bg-primary text-white transition-all"
          >
            {discountLoading ? <Spinner size={24} stroke={1.5} /> : "Apply"}
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
          {/* Subtotal ex-VAT */}
          <div className="flex justify-between text-sm text-[#555]">
            <span>Subtotal {isUAE ? " (excl. VAT)" : ""}</span>
            <span className="font-medium text-[#1a1a1a]">
              {fmt(subtotalExclVAT, currency)}
            </span>
          </div>

          {/* Discount ex-VAT */}
          {discountResult?.valid && discountExclVAT > 0 && (
            <>
              <div className="flex justify-between text-sm text-green-600">
                <span>Discount ({discountResult.code})</span>
                <span>− {fmt(discountExclVAT, currency)}</span>
              </div>
              <div className="flex justify-between text-sm text-[#555]">
                <span>Subtotal after discount</span>
                <span className="font-medium text-[#1a1a1a]">
                  {fmt(
                    Math.round((subtotalExclVAT - discountExclVAT) * 100) / 100,
                    currency,
                  )}
                </span>
              </div>
            </>
          )}

          {/* COD fee ex-VAT */}
          {method === "cod" && codFee > 0 && (
            <div className="flex justify-between text-sm text-amber-600">
              <span>COD fee {isUAE ? " (excl. VAT)" : ""}</span>
              <span>+ {fmt(codFeeExclVAT, currency)}</span>
            </div>
          )}

          {/* Shipping ex-VAT */}
          {ratesLoading ? (
            <div className="flex justify-between items-center gap-4">
              <Skeleton className="h-5 w-2/7 " />
              <Skeleton className="h-5 w-1/6 " />
            </div>
          ) : (
            <div className="flex justify-between text-sm text-[#555]">
              <span>Shipping {isUAE ? " (excl. VAT)" : ""}</span>

              <span className="font-medium text-[#1a1a1a]">
                {!selectedRate
                  ? "—"
                  : shippingExclVAT === 0
                    ? "FREE"
                    : fmt(shippingExclVAT, currency)}
              </span>
            </div>
          )}

          {/* VAT row — sum of all VAT portions */}
          {isUAE && (
            <div className="flex justify-between text-sm text-[#555]">
              <span>VAT ( @ 5% )</span>
              <span className="font-medium text-[#1a1a1a]">
                {fmt(totalVAT, currency)}
              </span>
            </div>
          )}

          {/* Grand total */}
          <div className="flex justify-between items-baseline border-t border-[#e0e0e0] pt-4 mt-1">
            <span className="text-base font-semibold">Total</span>
            <span className="text-2xl font-bold">
              {fmt(finalTotal, currency)}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
