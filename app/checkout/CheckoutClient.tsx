"use client";
// app/checkout/CheckoutClient.tsx
import Header from "../ui/header";
import { useState, useEffect } from "react";
import countriesLib from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";
import type {
  CheckoutPayload,
  CustomerInfo,
  ShopifyAddress,
} from "@/types/checkout.types";
import type {
  PaymentMethod,
  Step,
  ShippingRate,
  DiscountResult,
  NewAddrForm,
} from "@/types/checkout.types";
import { isTabbyAvailable } from "../lib/tabby.config";
import {
  toCountryCode,
  isCODAvailable,
  COD_FEE_AED,
} from "../lib/checkout-utils";
import { ContactSection } from "../ui/contact-section";
import { DeliverySection } from "../ui/delivery-section";
import { ShippingMethodSection } from "../ui/shipping-method";
import { PaymentSection } from "../ui/payment-section";
import { OrderSummary } from "../ui/order-summary";
import { CODSuccess } from "../ui/cod-sucess";
import { TABBY_SUPPORTED_CURRENCIES } from "../lib/tabby.config";
countriesLib.registerLocale(en);

export default function CheckoutClient({
  payload,
}: {
  payload: CheckoutPayload;
}) {
  const { items, currency, total, customer: prefill } = payload;

  const isLoggedIn = Boolean(prefill.email);
  const [savedAddresses, setSavedAddresses] = useState<ShopifyAddress[]>(
    prefill.addresses ?? [],
  );
  const hasAddresses = isLoggedIn && savedAddresses.length > 0;
  const defaultAddr =
    savedAddresses.find((a: ShopifyAddress) => a.is_default) ??
    savedAddresses[0];

  const [step, setStep] = useState<Step>(isLoggedIn ? "shipping" : "contact");
  const [method, setMethod] = useState<PaymentMethod>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState("");

  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [selectedRate, setSelectedRate] = useState<ShippingRate | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);

  const [aedToBase, setAedToBase] = useState<number>(1);
  const [discountResult, setDiscountResult] = useState<DiscountResult>(null);

  const [selectedAddressId, setSelectedId] = useState<string>(
    defaultAddr?.id ?? "",
  );
  const [useNewAddress, setUseNewAddress] = useState(false);

  const [customer, setCustomer] = useState<CustomerInfo>({
    id: prefill.id || "",
    name: prefill.name || "",
    email: prefill.email || "",
    phone: prefill.phone || "",
    address: prefill.address || "",
    city: prefill.city || "",
    country: "United Arab Emirates",
    countryCode: "AE", // ← seed this
    addresses: prefill.addresses ?? [],
  });

  // ── Exchange rate ──────────────────────────────────────────────
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

  // ── Derived totals ─────────────────────────────────────────────
  const discountAmount = discountResult?.valid
    ? discountResult.type === "percentage"
      ? (total * discountResult.amount) / 100
      : discountResult.amount
    : 0;

  const currentCountry = (() => {
    let raw: any;
    if (hasAddresses && !useNewAddress && selectedAddressId) {
      const addr = savedAddresses.find(
        (a: ShopifyAddress) => a.id === selectedAddressId,
      );
      raw = addr?.country || customer.country;
    } else {
      raw = customer.country;
    }
    return typeof raw === "object" && raw?.code ? raw.code : raw;
  })();

  const codAvailable = isCODAvailable(currentCountry);
  const shippingCostAED = selectedRate
    ? parseFloat(selectedRate.price.amount) || 0
    : 0;
  const codFeeAED = method === "cod" && codAvailable ? COD_FEE_AED : 0;
  const shippingCost = shippingCostAED * aedToBase;
  const codFee = codFeeAED * aedToBase;
  const grandTotal = total + shippingCost - discountAmount + codFee;

  // ── Shipping rates ─────────────────────────────────────────────
  async function fetchShippingRates(addr: CustomerInfo) {
    if (!addr.city || !addr.country) return;
    if (currency !== "AED" && aedToBase === 1) return;

    const countryCode = toCountryCode(addr.country);
    setRatesLoading(true);
    try {
      const res = await fetch("/api/shipping/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: {
            address1: addr.address,
            city: addr.city,
            country: countryCode,
            phone: addr.phone,
            currency,
            subtotalAED: currency === "AED" ? total : total / aedToBase,
            lineItems: items.map((i) => ({
              variantId: i.variant_id,
              quantity: i.quantity,
            })),
          },
        }),
      });
      const data = await res.json();
      setShippingRates(data.rates ?? []);
      setSelectedRate(data.rates?.[0] ?? null);
    } finally {
      setRatesLoading(false);
    }
  }

  useEffect(() => {
    if (hasAddresses && !useNewAddress && selectedAddressId) {
      const addr = savedAddresses.find(
        (a: ShopifyAddress) => a.id === selectedAddressId,
      );
      if (addr) {
        fetchShippingRates({
          ...customer,
          phone: addr.phone || customer.phone,
          address: [addr.address1, addr.address2].filter(Boolean).join(", "),
          city: addr.city,
          country: addr.country,
        });
      }
    } else {
      fetchShippingRates(customer);
    }
  }, [
    selectedAddressId,
    useNewAddress,
    customer.city,
    customer.country,
    customer.address,
    aedToBase,
  ]);

  // ── Helpers ────────────────────────────────────────────────────
  function getOrderCustomer(): CustomerInfo {
    const base = {
      ...customer,
      country: toCountryCode(customer.country || ""),
    };
    if (hasAddresses && !useNewAddress) {
      const addr = savedAddresses.find(
        (a: ShopifyAddress) => a.id === selectedAddressId,
      );
      if (addr)
        return {
          ...base,
          phone: addr.phone || customer.phone,
          address: [addr.address1, addr.address2].filter(Boolean).join(", "),
          city: addr.city,
          country: addr.country,
        };
    }
    return base;
  }

  async function handleApplyDiscount(code: string) {
    const res = await fetch("/api/discount/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, subtotal: total }),
    });
    const data = await res.json();
    setDiscountResult(data);
  }

  async function handleSaveNewAddress(newAddr: NewAddrForm) {
    const res = await fetch("/api/customer/add-address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: customer.id, address: newAddr }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to save address");

    const formatted: ShopifyAddress = {
      id: String(data.address.id),
      name: `${newAddr.firstName} ${newAddr.lastName}`.trim(),
      address1: data.address.address1,
      address2: data.address.address2 || "",
      city: data.address.city,
      country: data.address.country,
      phone: data.address.phone || "",
      is_default: false,
    };

    setSavedAddresses((prev) => [...prev, formatted]); // ← fixes the mutation bug
    setSelectedId(formatted.id);
    fetchShippingRates({
      ...customer,
      address: formatted.address1,
      city: formatted.city,
      country: formatted.country,
      phone: formatted.phone,
    });
  }

  async function startStripe() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          currency,
          customer: getOrderCustomer(),
          token: payload.token,
          shipping: shippingCost,
          shippingHandle: selectedRate?.handle,
          discountCode: discountResult?.valid ? discountResult.code : undefined,
          discountAmount: discountResult?.valid ? discountAmount : 0,
          discountType: discountResult?.valid ? discountResult.type : null,
          cancelUrl: window.location.href,
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

  async function placeCODOrder() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/orders/cod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          currency,
          customer: getOrderCustomer(),
          token: payload.token,
          shipping: shippingCostAED,
          codFee: codFeeAED,
          shippingHandle: selectedRate?.handle,
          discountCode: discountResult?.valid ? discountResult.code : undefined,
          discountAmount: discountResult?.valid ? discountAmount : 0,
          discountType: discountResult?.valid ? discountResult.type : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Order failed");
      setOrderId(data.orderId);
      setStep("cod-success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }
  async function startTabby() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/tabby/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          currency, // pass the actual store currency
          customer: getOrderCustomer(), // includes countryCode
          token: payload.token,
          cancelUrl: window.location.href,
          shipping: shippingCost, // pass shipping so Tabby total is accurate
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

  async function startTamara() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/tamara/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          currency,
          customer: getOrderCustomer(),
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
 const isTabbySupported = isTabbyAvailable(grandTotal, currency);


  function validateForm(): Record<string, string> {
    const errors: Record<string, string> = {};

    // ── Contact ──────────────────────────────────────────────────
    const firstName = customer.name.split(" ")[0];
    if (!firstName.trim()) errors.name = "First name is required";

    if (!customer.email.trim()) errors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))
      errors.email = "Enter a valid email address";

    // ── Delivery — skip if using a saved address ──────────────────
    const usingSavedAddress =
      hasAddresses && !useNewAddress && selectedAddressId;

    if (!usingSavedAddress) {
      if (!customer.countryCode) errors.country = "Country is required";

      if (!customer.address?.trim()) errors.address = "Address is required";

      if (!customer.city?.trim()) errors.city = "City is required";

      if (!customer.phone?.trim()) errors.phone = "Phone number is required";

      // Province (Emirate, State, Region) — required when country has zones
      if ((customer as any).provinceRequired && !(customer as any).province)
        errors.province = "This field is required";

      // ZIP / Postal code — required when country uses it
      if ((customer as any).zipRequired && !(customer as any).zip?.trim())
        errors.zip = "Postal code is required";
    }

    // ── Shipping ──────────────────────────────────────────────────
    if (!selectedRate) errors.shipping = "Please select a shipping method";

    // ── Payment ───────────────────────────────────────────────────
    if (!method) errors.payment = "Please select a payment method";

    return errors;
  }

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handlePayNow() {
    const errors = validateForm();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    if (method === "stripe") return startStripe();
    if (method === "tabby") return startTabby();
    if (method === "tamara") return startTamara();
    placeCODOrder();
  }

  const shippingReady = hasAddresses
    ? Boolean(selectedAddressId) || useNewAddress
    : Boolean(
        customer.address && customer.city && customer.phone && customer.name,
      );

  // ── Render ─────────────────────────────────────────────────────
  return (
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
                  <ContactSection
                    customer={customer}
                    isLoggedIn={isLoggedIn}
                    onChange={(c) => {
                      setCustomer(c);
                      setFieldErrors((prev) => ({
                        ...prev,
                        name: "",
                        email: "",
                      }));
                    }}
                    errors={fieldErrors} // ← add this
                  />

                  <DeliverySection
                    isLoggedIn={isLoggedIn}
                    hasAddresses={hasAddresses}
                    savedAddresses={savedAddresses}
                    defaultAddr={defaultAddr}
                    selectedAddressId={selectedAddressId}
                    useNewAddress={useNewAddress}
                    customer={customer}
                    onSelectAddress={setSelectedId}
                    onUseNewAddress={setUseNewAddress}
                    onSaveNewAddress={handleSaveNewAddress}
                    errors={fieldErrors} // ← add this
                    onCustomerChange={(c) => {
                      setCustomer(c);
                      setFieldErrors((prev) => ({
                        ...prev,
                        name: "",
                        address: "",
                        city: "",
                        phone: "",
                        province: "",
                        zip: "",
                        country: "", // ← add this
                      }));
                    }}
                  />

                  <ShippingMethodSection
                    rates={shippingRates}
                    selectedRate={selectedRate}
                    loading={ratesLoading}
                    currency={currency}
                    aedToBase={aedToBase}
                    error={fieldErrors.shipping} // ← add this
                    onSelect={(rate) => {
                      setSelectedRate(rate);
                      setFieldErrors((prev) => ({ ...prev, shipping: "" }));
                    }}
                  />

                  <PaymentSection
                    method={method}
                    codAvailable={codAvailable}
                    error={fieldErrors.payment}
                    isTabbyAvailable={isTabbySupported}
                    onChange={(m) => {
                      setMethod(m);
                      setFieldErrors((prev) => ({ ...prev, payment: "" }));
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
                      (!shippingReady && !(hasAddresses && !useNewAddress))
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

        <OrderSummary
          items={items}
          currency={currency}
          total={total}
          shippingCost={shippingCost}
          codFee={codFee}
          grandTotal={grandTotal}
          method={method}
          codAvailable={codAvailable}
          ratesLoading={ratesLoading}
          selectedRate={selectedRate}
          discountResult={discountResult}
          discountAmount={discountAmount}
          onApplyDiscount={handleApplyDiscount}
        />
      </div>
    </div>
  );
}
