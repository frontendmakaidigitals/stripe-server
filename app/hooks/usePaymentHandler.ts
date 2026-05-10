"use client";
import type { CustomerInfo, CheckoutPayload } from "@/types/checkout.types";
import type { PaymentMethod, ShippingRate, DiscountResult, Step } from "@/types/checkout.types";
import {toast} from 'sonner'
interface UsePaymentHandlersOptions {
  items: CheckoutPayload["items"];
  currency: string;
  payload: CheckoutPayload;
  shippingCost: number;
  shippingCostAED: number;
  codFee: number;        // ← add this
  codFeeAED: number;
  selectedRate: ShippingRate | null;
  discountResult: DiscountResult;
  discountAmount: number;
  aedToBase: number;
  setLoading: (v: boolean) => void;
  setOrderId: (v: string) => void;
  setStep: (v: Step) => void;
}

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
  aedToBase,
  setLoading,
  setOrderId,
  setStep,
  codFee
}: UsePaymentHandlersOptions) {
  // ── Shared discount payload ──────────────────────────────────────────────
  const discountPayload = discountResult?.valid
    ? {
        discountCode:   discountResult.code,
        discountAmount,
        discountType:   discountResult.type,
      }
    : { discountCode: undefined, discountAmount: 0, discountType: null };

    const cancelUrl = typeof window !== "undefined"
  ? `${window.location.origin}${window.location.pathname}${
      payload.token ? `?token=${payload.token}` : ""
    }`
  : "";
  // ── Stripe ───────────────────────────────────────────────────────────────
  function getFriendlyStripeError(raw: string, currency: string): string {
  const msg = raw.toLowerCase();

  if (msg.includes("invalid currency") || msg.includes("currency"))
    return `Card payments are not supported in ${currency.toUpperCase()}.`;

  if (msg.includes("card was declined") || msg.includes("card_declined"))
    return "Your card was declined. Please try a different card.";

  if (msg.includes("insufficient_funds"))
    return "Your card has insufficient funds. Please try a different card.";

  if (msg.includes("expired_card") || msg.includes("card has expired"))
    return "Your card has expired. Please use a different card.";

  if (msg.includes("incorrect_cvc") || msg.includes("security code"))
    return "Your card's security code is incorrect. Please check and try again.";

  if (msg.includes("incorrect_number") || msg.includes("card number"))
    return "Your card number is incorrect. Please check and try again.";

  if (msg.includes("authentication_required") || msg.includes("3d secure"))
    return "Your bank requires additional authentication. Please try again and complete the verification.";

  if (msg.includes("rate_limit") || msg.includes("too many requests"))
    return "Too many requests. Please wait a moment and try again.";

  if (msg.includes("network") || msg.includes("fetch"))
    return "A network error occurred. Please check your connection and try again.";

  if (msg.includes("stripe checkout failed") || msg.includes("checkout failed"))
    return "Unable to start checkout. Please try again.";

  return "Payment failed. Please try again or use a different payment method.";
}
  async function startStripe(customer: CustomerInfo) {
    setLoading(true);
    try {
      const discountAmountAED =
        aedToBase > 0 ? discountAmount / aedToBase : discountAmount;

      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          currency,
          customer,
          token:             payload.token,
          shipping:          shippingCost,       // display currency, for Stripe line item
          shippingHandle:    selectedRate?.handle,
          cancelUrl,
          aedToBase,
          shippingAED:       shippingCostAED,
          discountAmountAED,
          ...discountPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Stripe checkout failed");
      window.location.href = data.url;
    } catch (err: unknown) {
  
  // ← friendly message for unsupported currency
        const raw = err instanceof Error ? err.message : "";
      const msg = getFriendlyStripeError(raw, currency);
      toast.error(msg, {
        description: "If the problem persists, please contact support.",
        duration: 6000,
        className:'bg-red-500! text-red-50!'
      });
      setLoading(false);
        }
      }

  // ── Tabby ────────────────────────────────────────────────────────────────
async function startTabby(customer: CustomerInfo) {
  setLoading(true);
  try {
    const itemsInAED = items.map((item) => ({
      ...item,
      price: aedToBase > 0 ? item.price / aedToBase : item.price,
    }));

    const discountAmountAED =
      aedToBase > 0 ? discountAmount / aedToBase : discountAmount;

    const res = await fetch("/api/tabby/create-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items:          itemsInAED,          // ← AED prices for Shopify
        currency,                            // ← display currency (SAR/KWD/AED) for Tabby routing
        customer,
        token:          payload.token,
        shipping:       shippingCostAED,     // ← AED for Shopify
        shippingHandle: selectedRate?.handle,
        cancelUrl,
        ...discountPayload,
        discountAmount: discountAmountAED,   // ← AED for Shopify
        // Pass display-currency values separately so Tabby session amount is correct
        shippingDisplay:  shippingCost,         // ← display currency for Tabby amount calc
        discountDisplay:  discountAmount,        // ← display currency for Tabby amount calc
        itemsDisplay:     items,                 // ← display currency for Tabby amount calc
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Tabby checkout failed");
    window.location.href = data.url;
  } catch (err: unknown) {

    toast.error('Payment unavailable',{
        description: err instanceof Error ? err.message : "Something went wrong",
        duration: 6000,
        className:'bg-red-500! text-red-50!'
      });
       
    setLoading(false);
  }
}

  // ── Tamara ───────────────────────────────────────────────────────────────
  function getFriendlyTamaraError(raw: string): string {
  const msg = raw.toLowerCase();

  if (msg.includes("not available") || msg.includes("not supported"))
    return "Tamara is not available for this order. Please try a different payment method.";

  if (msg.includes("limit") || msg.includes("amount"))
    return "Your order total is outside Tamara's supported range. Please try a different payment method.";

  if (msg.includes("country") || msg.includes("region"))
    return "Tamara is not available in your region.";

  if (msg.includes("network") || msg.includes("fetch"))
    return "A network error occurred. Please check your connection and try again.";

  if (msg.includes("tamara session failed") || msg.includes("checkout failed"))
    return "Unable to start Tamara checkout.";

  return "Payment failed. Please try again or use a different payment method.";
}
  async function startTamara(customer: CustomerInfo) {
  setLoading(true);

  try {
    const itemsInAED = items.map((item) => ({
      ...item,
      price: aedToBase > 0 ? item.price / aedToBase : item.price,
    }));
 
    const discountAmountAED =
      aedToBase > 0 ? discountAmount / aedToBase : discountAmount;
 
    const res = await fetch("/api/tamara/create-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items:          itemsInAED,         
        currency,                           
        customer,
        token:          payload.token,
        shipping:       shippingCostAED,    
        shippingHandle: selectedRate?.handle,
        cancelUrl,
        ...discountPayload,
        discountAmount: discountAmountAED,  
      }),
    });
 
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Tamara checkout failed");
    window.location.href = data.url;
  } catch (err: unknown) {
   const raw = err instanceof Error ? err.message : "";
    const msg = getFriendlyTamaraError(raw);

    toast.error(msg, {
      description: "If the problem persists, please contact support.",
      duration: 6000,
      className:'bg-red-500! text-red-50!'
    });
    setLoading(false);
  }
}

  // ── Cash on Delivery ─────────────────────────────────────────────────────
  async function placeCODOrder(customer: CustomerInfo) {
    setLoading(true);
    try {
      const itemsInAED = items.map((item) => ({
        ...item,
        price: aedToBase > 0 ? item.price / aedToBase : item.price,
      }));

      const discountAmountAED =
        aedToBase > 0 ? discountAmount / aedToBase : discountAmount;

      const res = await fetch("/api/orders/cod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items:          itemsInAED,
          currency:       "AED",
          customer,
          token:          payload.token,
          shipping:       shippingCostAED,
          codFee:         codFeeAED,
          shippingHandle: selectedRate?.handle,
          ...discountPayload,
          discountAmount: discountAmountAED,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Order failed");
      setOrderId(data.orderId);
      setStep("cod-success" as Step);
          const params = new URLSearchParams({
          orderId:        data.orderId,
          provider:       "cod",
          name:           customer.name,
          email:          customer.email,
          phone:          customer.phone,
          address:        customer.address,
          city:           customer.city,
          country:        customer.country,
          items:          JSON.stringify(items),        // ← original items (display currency prices)
          currency:       currency,                     // ← display currency e.g. "SAR", not hardcoded "AED"
          shipping:       String(shippingCost),         // ← display currency, not shippingCostAED
          codFee:         String(codFee),               // ← display currency, not codFeeAED
          shippingHandle: selectedRate?.handle ?? "",
          discountAmount: String(discountAmount),       // ← display currency, not discountAmountAED
          discountCode:   discountPayload?.discountCode ?? "",
        });
window.location.href = `/success?${params.toString()}`;
    window.location.href = `/success?${params.toString()}`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg, {duration: 6000,
        className:'bg-red-500! text-red-50!'});

    } finally {
      setLoading(false);
    }
  }

  // ── Dispatcher ───────────────────────────────────────────────────────────
  function dispatchPayment(method: PaymentMethod, customer: CustomerInfo) {
    if (method === "stripe") return startStripe(customer);
    if (method === "tabby")  return startTabby(customer);
    if (method === "tamara") return startTamara(customer);
    placeCODOrder(customer);
  }

  return { startStripe, startTabby, startTamara, placeCODOrder, dispatchPayment };
}