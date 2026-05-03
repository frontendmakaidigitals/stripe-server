// app/checkout/CheckoutClient.tsx
"use client";
import { useState } from "react";
import { FormProvider } from "react-hook-form";
import countriesLib from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";

import type {
  CheckoutPayload,
  CustomerInfo,
  ShopifyAddress,
} from "@/types/checkout.types";
import type { PaymentMethod, Step } from "@/types/checkout.types";

import { isTabbyAvailable } from "../lib/tabby.config";
import { toCountryCode } from "../lib/checkout-utils";
import { CheckoutContext } from "./checkoutContext";

import { useExchangeRate } from "../hooks/useExchangeRate";
import { useCheckoutForm } from "../hooks/useCheckoutForm";
import { useAddress } from "../hooks/useAddress";
import { useShippingRates } from "../hooks/useShippingRate";
import { useCheckoutTotals } from "../hooks/useCheckoutTotal";
import { usePaymentHandlers } from "../hooks/usePaymentHandler";

import Header from "../ui/header";
import { ContactSection } from "../ui/contact-section";
import { DeliverySection } from "../ui/delivery-section";
import { ShippingMethodSection } from "../ui/shipping-method";
import { PaymentSection } from "../ui/payment-section";
import { OrderSummary } from "../ui/order-summary";
import { CODSuccess } from "../ui/cod-sucess";

countriesLib.registerLocale(en);

export default function CheckoutClient({
  payload,
}: {
  payload: CheckoutPayload;
}) {
  const { items, currency, total, customer: prefill } = payload;
  const isLoggedIn = Boolean(prefill.email);

  // ── State that stays local ────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(isLoggedIn ? "shipping" : "contact");
  const [method, setMethod] = useState<PaymentMethod>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState("");
  const [shippingError, setShippingError] = useState("");
  const [paymentError, setPaymentError] = useState("");

  // ── State that goes into context ──────────────────────────────────────────
  const [customer, setCustomer] = useState<CustomerInfo>({
    id: prefill.id || "",
    name: prefill.name || "",
    email: prefill.email || "",
    phone: prefill.phone || "",
    address: prefill.address || "",
    city: prefill.city || "",
    country: "United Arab Emirates",
    countryCode: "AE",
    addresses: prefill.addresses ?? [],
  });
  const [discountResult, setDiscountResult] = useState<any>(null);

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const aedToBase = useExchangeRate(currency);
  const { methods, onRequiredChange } = useCheckoutForm(prefill);
  const hasAddresses = isLoggedIn && (prefill.addresses ?? []).length > 0;

  const shippingRatesApi = useShippingRates({
    currency,
    total,
    aedToBase,
    items,
    hasAddresses,
    useNewAddress: false,
    selectedAddressId: "",
    savedAddresses: prefill.addresses ?? [],
    customer,
  });

  const address = useAddress({
    customerId: customer.id,
    initialAddresses: prefill.addresses ?? [],
    customer,
    fetchShippingRates: shippingRatesApi.fetchShippingRates,
  });

  const {
    shippingRates,
    selectedRate,
    setSelectedRate,
    ratesLoading,
    fetchShippingRates,
  } = useShippingRates({
    currency,
    total,
    aedToBase,
    items,
    hasAddresses,
    useNewAddress: address.useNewAddress,
    selectedAddressId: address.selectedAddressId,
    savedAddresses: address.savedAddresses,
    customer,
  });

  const currentCountry = (() => {
    let raw: any;
    if (hasAddresses && !address.useNewAddress && address.selectedAddressId) {
      const addr = address.savedAddresses.find(
        (a: ShopifyAddress) => a.id === address.selectedAddressId,
      );
      raw = addr?.country || customer.country;
    } else {
      raw = customer.country;
    }
    return typeof raw === "object" && raw?.code ? raw.code : raw;
  })();

  const totals = useCheckoutTotals({
    total,
    aedToBase,
    selectedRate,
    method,
    discountResult,
    currentCountry,
  });

  const { dispatchPayment } = usePaymentHandlers({
    items,
    currency,
    payload,
    shippingCost: totals.shippingCost,
    shippingCostAED: totals.shippingCostAED,
    codFeeAED: totals.codFeeAED,
    selectedRate,
    discountResult,
    discountAmount: totals.discountAmount,
    setLoading,
    setError,
    setOrderId,
    setStep,
  });

  async function handleApplyDiscount(code: string) {
    const res = await fetch("/api/discount/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, subtotal: total }),
    });
    setDiscountResult(await res.json());
  }

  function getOrderCustomer(): CustomerInfo {
    const formValues = methods.getValues();
    const base: CustomerInfo = {
      ...customer,
      phone: formValues.phone || customer.phone,
      country: toCountryCode(customer.country || ""),
      email: formValues.email || customer.email,
    };
    if (hasAddresses && !address.useNewAddress) {
      const saved = address.savedAddresses.find(
        (a: ShopifyAddress) => a.id === address.selectedAddressId,
      );
      if (saved) {
        return {
          ...base,
          phone: saved.phone || formValues.phone || customer.phone,
          address: [saved.address1, saved.address2].filter(Boolean).join(", "),
          city: saved.city,
          country: saved.country,
        };
      }
    }
    return base;
  }

  function handlePayNow() {
    if (!selectedRate) setShippingError("Please select a shipping method");
    if (!method) setPaymentError("Please select a payment method");
    if (!selectedRate || !method) return;

    if (hasAddresses && !address.useNewAddress && address.selectedAddressId) {
      dispatchPayment(method, getOrderCustomer());
      return;
    }

    methods.handleSubmit(
      (data) => {
        const freshCustomer: CustomerInfo = {
          ...customer,
          name: `${data.firstName} ${data.lastName}`.trim(),
          email: data.email,
          phone: data.phone,
          address: data.address1,
          city: data.city,
          countryCode: data.countryCode,
          country: data.countryCode,
        };
        setCustomer(freshCustomer);
        dispatchPayment(method, freshCustomer);
      },
      (validationErrors) => {
        console.log("[Checkout] Validation errors:", validationErrors);
        setError("Please fill in all required fields above.");
      },
    )();
  }

  const formValues = methods.watch();
  const shippingReady = hasAddresses
    ? Boolean(address.selectedAddressId) || address.useNewAddress
    : Boolean(
        formValues.address1 &&
        formValues.city &&
        formValues.phone &&
        formValues.firstName,
      );

  const isTabbySupported = isTabbyAvailable(totals.grandTotal, currency);

  // ── Context value ─────────────────────────────────────────────────────────
  const contextValue = {
    customer,
    setCustomer,
    currency,
    aedToBase,
    method,
    setMethod,
    discountResult,
    setDiscountResult,
    totals,
    items,
    total,
  };

  return (
    <CheckoutContext.Provider value={contextValue}>
      <FormProvider {...methods}>
        <div
          style={{ fontFamily: "'Söhne', 'Helvetica Neue', Arial, sans-serif" }}
          className="min-h-screen bg-white text-[#1a1a1a]"
        >
          <div className="flex w-full justify-center py-4 border-b border-gray-200">
            <Header />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="min-h-[calc(100vh-65px)]">
              <main className="w-full flex container py-10 justify-end">
                <div className="w-full max-w-lg">
                  {step === "cod-success" ? (
                    <CODSuccess
                      orderId={orderId}
                      phone={getOrderCustomer().phone}
                      email={customer.email}
                    />
                  ) : (
                    <>
                      {/* No more props — these components read from context */}
                      <ContactSection isLoggedIn={isLoggedIn} />

                      <DeliverySection
                        isLoggedIn={isLoggedIn}
                        hasAddresses={hasAddresses}
                        savedAddresses={address.savedAddresses}
                        defaultAddr={address.defaultAddr}
                        selectedAddressId={address.selectedAddressId}
                        useNewAddress={address.useNewAddress}
                        onSelectAddress={address.setSelectedAddressId}
                        onSaveNewAddress={address.handleSaveNewAddress}
                        onUseNewAddress={address.setUseNewAddress}
                        onRequiredChange={onRequiredChange}
                      />

                      <ShippingMethodSection
                        rates={shippingRates}
                        selectedRate={selectedRate}
                        loading={ratesLoading}
                        error={shippingError}
                        onSelect={(rate) => {
                          setSelectedRate(rate);
                          setShippingError("");
                        }}
                      />

                      {/* PaymentSection reads method/setMethod/totals from context */}
                      <PaymentSection
                        error={paymentError}
                        isTabbyAvailable={isTabbySupported}
                        onChange={(m) => {
                          setMethod(m);
                          setPaymentError("");
                        }}
                      />

                      {error && (
                        <div className="mb-4 rounded-[6px] border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#dc2626]">
                          {error}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={handlePayNow}
                        disabled={
                          !method ||
                          loading ||
                          (!shippingReady &&
                            !(hasAddresses && !address.useNewAddress))
                        }
                        className={`w-full rounded-[6px] py-4 text-base font-semibold text-white transition-all ${
                          !method || loading
                            ? "bg-[#aaa] cursor-not-allowed"
                            : "bg-primary hover:bg-primary/90 active:scale-[0.99]"
                        }`}
                      >
                        {loading
                          ? "Processing…"
                          : method === "stripe"
                            ? "Pay now"
                            : "Place order"}
                      </button>

                      <div className="mt-6 flex justify-center gap-6 text-xs text-[#aaa]">
                        <a href="#" className="hover:text-[#555]">
                          Privacy policy
                        </a>
                        <a href="#" className="hover:text-[#555]">
                          Terms of service
                        </a>
                      </div>
                    </>
                  )}
                </div>
              </main>
            </div>

            {/* OrderSummary reads everything it needs from context */}
            <OrderSummary
              selectedRate={selectedRate}
              ratesLoading={ratesLoading}
              onApplyDiscount={handleApplyDiscount}
            />
          </div>
        </div>
      </FormProvider>
    </CheckoutContext.Provider>
  );
}
