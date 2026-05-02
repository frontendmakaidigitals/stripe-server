"use client";
import type { CustomerInfo, CheckoutPayload } from "@/types/checkout.types";
import type { PaymentMethod, ShippingRate, DiscountResult, Step } from "@/types/checkout.types";

interface UsePaymentHandlersOptions {
  items: CheckoutPayload["items"];
  currency: string;
  payload: CheckoutPayload;
  shippingCost: number;
  shippingCostAED: number;
  codFeeAED: number;
  selectedRate: ShippingRate | null;
  discountResult: DiscountResult;
  discountAmount: number;
  setLoading: (v: boolean) => void;
  setError: (v: string) => void;
  setOrderId: (v: string) => void;
  setStep: (v: Step) => void;
}

/**
 * All payment-gateway submit functions.
 * Each function accepts an optional customerOverride so it can be called
 * both from the saved-address path (no override) and the guest/new-address
 * path (override built from validated form data).
 */
export function usePaymentHandlers({
  items,
  currency,
  payload,
  shippingCost,
  shippingCostAED,
  codFeeAED,
  selectedRate,
  discountResult,
  discountAmount,
  setLoading,
  setError,
  setOrderId,
  setStep,
}: UsePaymentHandlersOptions) {
  // ── Shared discount payload ─────────────────────────────────────
  const discountPayload = discountResult?.valid
    ? {
        discountCode: discountResult.code,
        discountAmount,
        discountType: discountResult.type,
      }
    : { discountCode: undefined, discountAmount: 0, discountType: null };

  // ── Stripe ──────────────────────────────────────────────────────
  async function startStripe(customer: CustomerInfo) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          currency,
          customer,
          token: payload.token,
          shipping: shippingCost,
          shippingHandle: selectedRate?.handle,
          cancelUrl: window.location.href,
          ...discountPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Stripe checkout failed");
      window.location.href = data.url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  // ── Tabby ───────────────────────────────────────────────────────
  async function startTabby(customer: CustomerInfo) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/tabby/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          currency,
          customer,
          token: payload.token,
          shipping: shippingCost,
          cancelUrl: window.location.href,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Tabby checkout failed");
      window.location.href = data.url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  // ── Tamara ──────────────────────────────────────────────────────
  async function startTamara(customer: CustomerInfo) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/tamara/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          currency,
          customer,
          token: payload.token,
          shipping: shippingCost,
          cancelUrl: window.location.href,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Tamara checkout failed");
      window.location.href = data.url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  // ── Cash on Delivery ────────────────────────────────────────────
  async function placeCODOrder(customer: CustomerInfo) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/orders/cod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          currency,
          customer,
          token: payload.token,
          shipping: shippingCostAED,
          codFee: codFeeAED,
          shippingHandle: selectedRate?.handle,
          ...discountPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Order failed");
      setOrderId(data.orderId);
      setStep("cod-success" as Step);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // ── Dispatcher ──────────────────────────────────────────────────
  function dispatchPayment(method: PaymentMethod, customer: CustomerInfo) {
    if (method === "stripe") return startStripe(customer);
    if (method === "tabby") return startTabby(customer);
    if (method === "tamara") return startTamara(customer);
    placeCODOrder(customer);
  }

  return { startStripe, startTabby, startTamara, placeCODOrder, dispatchPayment };
}