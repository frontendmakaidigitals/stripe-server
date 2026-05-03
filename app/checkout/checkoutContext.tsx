"use client";
import { createContext, useContext } from "react";
import type {
  CustomerInfo,
  PaymentMethod,
  DiscountResult,
} from "@/types/checkout.types";
import { CheckoutPayload } from "@/types/checkout.types";

export type CheckoutTotals = {
  codAvailable: boolean;
  discountAmount: number;
  shippingCostAED: number;
  codFeeAED: number;
  shippingCost: number;
  codFee: number;
  grandTotal: number;
  // ← items and total removed from here
};

type CheckoutContextValue = {
  customer: CustomerInfo;
  setCustomer: (c: CustomerInfo) => void;
  currency: string;
  aedToBase: number;
  method: PaymentMethod;
  setMethod: (m: PaymentMethod) => void;
  discountResult: DiscountResult;
  setDiscountResult: (d: DiscountResult) => void;
  totals: CheckoutTotals;
  items: CheckoutPayload["items"];
  total: number;
};

const CheckoutContext = createContext<CheckoutContextValue | null>(null);

export function useCheckoutContext() {
  const ctx = useContext(CheckoutContext);
  if (!ctx)
    throw new Error("useCheckoutContext must be used inside CheckoutProvider");
  return ctx;
}

export { CheckoutContext };
