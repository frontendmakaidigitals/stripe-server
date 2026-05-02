"use client";
import type { DiscountResult, ShippingRate } from "@/types/checkout.types";
import type { PaymentMethod } from "@/types/checkout.types";
import { isCODAvailable, COD_FEE_AED } from "../lib/checkout-utils";

interface UseCheckoutTotalsOptions {
  total: number;
  aedToBase: number;
  selectedRate: ShippingRate | null;
  method: PaymentMethod;
  discountResult: DiscountResult;
  currentCountry: string;
}

/**
 * Derives all monetary totals from raw inputs.
 * No side-effects — pure calculation.
 */
export function useCheckoutTotals({
  total,
  aedToBase,
  selectedRate,
  method,
  discountResult,
  currentCountry,
}: UseCheckoutTotalsOptions) {
  const codAvailable = isCODAvailable(currentCountry);

  const discountAmount = discountResult?.valid
    ? discountResult.type === "percentage"
      ? (total * discountResult.amount) / 100
      : discountResult.amount
    : 0;

  const shippingCostAED = selectedRate
    ? parseFloat(selectedRate.price.amount) || 0
    : 0;

  const codFeeAED = method === "cod" && codAvailable ? COD_FEE_AED : 0;
  const shippingCost = shippingCostAED * aedToBase;
  const codFee = codFeeAED * aedToBase;
  const grandTotal = total + shippingCost - discountAmount + codFee;

  return {
    codAvailable,
    discountAmount,
    shippingCostAED,
    codFeeAED,
    shippingCost,
    codFee,
    grandTotal,
  };
}