"use client";
// app/checkout/CheckoutClient.tsx
import Header from "../ui/header";
import { useState, useEffect } from "react";
import type {
  CheckoutPayload,
  CustomerInfo,
  ShopifyAddress,
} from "../lib/checkout-token";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import countriesLib from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";
import Image from "next/image";
type PaymentMethod = "stripe" | "cod" | null;
type Step = "contact" | "shipping" | "payment" | "cod-success";

countriesLib.registerLocale(en);
type ShippingRate = {
  handle: string;
  title: string;
  estimatedDays?: string | null;
  price: { amount: string; currencyCode: string };
};
const CURRENCY_LOCALE: Record<string, string> = {
  USD: "en-US",
  EUR: "de-DE",
  CAD: "en-CA",
  AED: "en-AE", // ✅ English numerals, AED symbol
  SAR: "en-SA", // ✅ English numerals, SAR symbol
};

function fmt(amount: number, currency: string) {
  const locale = CURRENCY_LOCALE[currency] ?? "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number(amount));
}
export default function CheckoutClient({
  payload,
}: {
  payload: CheckoutPayload;
}) {
  const { items, currency, total, customer: prefill } = payload;

  const isLoggedIn = Boolean(prefill.email);
  const savedAddresses = prefill.addresses ?? [];
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
  const [discountCode, setDiscountCode] = useState("");
  const [discountResult, setDiscountResult] = useState<{
    valid: boolean;
    amount: number;
    type: "percentage" | "fixed" | null;
    code: string;
  } | null>(null);
  const [discountLoading, setDiscountLoading] = useState(false);
  const countries = Object.entries(countriesLib.getNames("en")).map(
    ([code, name]) => ({
      code,
      name,
    }),
  );
  // Add discount calculation
  const discountAmount = discountResult?.valid
    ? discountResult.type === "percentage"
      ? (total * discountResult.amount) / 100
      : discountResult.amount
    : 0;
  const [selectedAddressId, setSelectedId] = useState<string>(
    defaultAddr?.id ?? "",
  );
  const [useNewAddress, setUseNewAddress] = useState(false);
  async function applyDiscount() {
    if (!discountCode.trim()) return;
    setDiscountLoading(true);
    try {
      const res = await fetch("/api/discount/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: discountCode, subtotal: total }),
      });
      const data = await res.json();
      setDiscountResult(data);
    } finally {
      setDiscountLoading(false);
    }
  }
  const [customer, setCustomer] = useState<CustomerInfo>({
    id: prefill.id || "",
    name: prefill.name || "",
    email: prefill.email || "",
    phone: prefill.phone || "",
    address: prefill.address || "",
    city: prefill.city || "",
    country: prefill.country || "AE",
    addresses: prefill.addresses ?? [],
  });
  const COD_COUNTRIES = ["AE"];
  const currentCountry = (() => {
    if (hasAddresses && !useNewAddress && selectedAddressId) {
      const addr = savedAddresses.find(
        (a: ShopifyAddress) => a.id === selectedAddressId,
      );
      return addr?.country || customer.country;
    }
    return customer.country;
  })();
  const codAvailable = isCODAvailable(currentCountry);
  function isCODAvailable(country: string): boolean {
    return COD_COUNTRIES.includes(country.toUpperCase());
  }
  const COD_FEE_AED = 10;
  const shippingCost = selectedRate
    ? parseFloat(selectedRate.price.amount) || 0
    : 0;

  const codFee = method === "cod" && codAvailable ? COD_FEE_AED : 0;

  const shippingCurrency = selectedRate?.price.currencyCode ?? "AED";
  const shippingInDisplayCurrency =
    shippingCurrency === currency ? shippingCost : 0;
  const grandTotal =
    total + shippingInDisplayCurrency - discountAmount + codFee;
  async function fetchShippingRates(addr: CustomerInfo) {
    if (!addr.city || !addr.country) return; // ← remove addr.address check
    setRatesLoading(true);
    try {
      const res = await fetch("/api/shipping/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: {
            address1: addr.address,
            city: addr.city,
            country: addr.country,
            phone: addr.phone,
            // Pass subtotal so API can apply min/max order conditions.
            // If currency isn't AED this will be approximate, but it's
            // only used for the AED domestic zone anyway.
            subtotalAED: total,
            lineItems: items.map((i) => ({
              variantId: i.variant_id,
              quantity: i.quantity,
            })),
          },
        }),
      });
      const data = await res.json();
      console.log("Shipping API response:", data);
      setShippingRates(data.rates ?? []);
      setSelectedRate(data.rates?.[0] ?? null);
    } finally {
      setRatesLoading(false);
    }
  }
  useEffect(() => {
    if (hasAddresses && !useNewAddress && selectedAddressId) {
      // Build addr directly from savedAddresses instead of calling getOrderCustomer()
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
      // Guest / new address form
      fetchShippingRates(customer);
    }
  }, [
    selectedAddressId,
    useNewAddress,
    customer.city,
    customer.country,
    customer.address,
  ]);
  function getOrderCustomer(): CustomerInfo {
    if (hasAddresses && !useNewAddress) {
      const addr = savedAddresses.find(
        (a: ShopifyAddress) => a.id === selectedAddressId,
      );
      if (addr) {
        return {
          ...customer,
          phone: addr.phone || customer.phone,
          address: [addr.address1, addr.address2].filter(Boolean).join(", "),
          city: addr.city,
          country: addr.country,
        };
      }
    }
    return customer;
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
          discountCode: discountResult?.valid ? discountCode : undefined,
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
          shipping: shippingCost,
          codFee,
          shippingHandle: selectedRate?.handle,
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

  function handlePayNow(e: React.FormEvent) {
    e.preventDefault();
    if (!method) return;
    method === "stripe" ? startStripe() : placeCODOrder();
  }

  const shippingReady = hasAddresses
    ? Boolean(selectedAddressId) || useNewAddress
    : Boolean(
        customer.address && customer.city && customer.phone && customer.name,
      );

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
          {/* ── LEFT: form ── */}
          <main className="w-full flex container py-10  justify-end  ">
            <div className="  w-full max-w-lg">
              {step === "cod-success" ? (
                <div className="mt-12 text-center">
                  <div className="text-5xl mb-5">✅</div>
                  <h2 className="text-2xl font-bold mb-3">Order confirmed!</h2>
                  <p className="text-[#555] leading-relaxed mb-1">
                    Your order{" "}
                    <span className="font-semibold text-[#111]">
                      #{orderId}
                    </span>{" "}
                    has been received.
                  </p>
                  <p className="text-[#555] leading-relaxed mb-1">
                    We'll contact you at{" "}
                    <span className="font-semibold text-[#111]">
                      {getOrderCustomer().phone}
                    </span>{" "}
                    to confirm delivery.
                  </p>
                  <p className="text-sm text-[#999] mt-2">
                    Confirmation sent to{" "}
                    <span className="font-semibold">{customer.email}</span>.
                  </p>
                  <a
                    href={`https://${process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN || "perfumeoasis.ae"}`}
                    className="mt-8 inline-block text-sm font-semibold text-[#1a1a1a] underline underline-offset-4"
                  >
                    ← Back to store
                  </a>
                </div>
              ) : (
                <>
                  {/* ── CONTACT section (guest only) ── */}
                  {!isLoggedIn && (
                    <section className="mb-8">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold">Contact</h2>
                        <a
                          href={`${process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN}/account/login`}
                          className="text-sm text-[#1a6cff] hover:underline"
                        >
                          Sign in
                        </a>
                      </div>
                      <input
                        className="w-full border border-[#d4d4d4] rounded-[6px] px-4 py-3 text-sm outline-none focus:border-[#1a1a1a] transition-colors"
                        type="email"
                        placeholder="Email"
                        value={customer.email}
                        onChange={(e) =>
                          setCustomer((c) => ({ ...c, email: e.target.value }))
                        }
                      />
                      <label className="flex items-center gap-2 mt-3 text-sm text-[#555] cursor-pointer">
                        <input type="checkbox" className="w-4 h-4 rounded" />
                        Email me with news and offers
                      </label>
                    </section>
                  )}

                  {/* ── Logged-in contact pill ── */}
                  {isLoggedIn && (
                    <div className="mb-5 flex items-center justify-between border-b border-gray-300 py-3">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full bg-neutral-100 border border-gray-300 flex items-center justify-center text-sm font-semibold text-[#444]">
                          {(customer.name || customer.email)
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                        <span className="text-sm font-medium">
                          {customer.email}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* ── DELIVERY section ── */}
                  <section className="mb-8">
                    <h2 className="text-sm text-gray-600 mb-4">Ship to</h2>

                    {/* Logged-in: saved addresses */}
                    {isLoggedIn && hasAddresses && !useNewAddress && (
                      <>
                        <div className=" rounded-lg overflow-hidden divide-y divide-sky-100 mb-3">
                          {savedAddresses.map((addr: ShopifyAddress) => (
                            <label
                              key={addr.id}
                              className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                                selectedAddressId === addr.id
                                  ? "bg-indigo-500/8"
                                  : "bg-white hover:bg-[#fafafa]"
                              }`}
                            >
                              <input
                                type="radio"
                                name="address"
                                value={addr.id}
                                checked={selectedAddressId === addr.id}
                                onChange={() => setSelectedId(addr.id)}
                                className="mt-1 w-4 h-4 accent-[#1a1a1a]"
                              />
                              <div className="flex-1">
                                <p className="text-sm text-gray-800 mt-0.5">
                                  {[addr.address1, addr.address2]
                                    .filter(Boolean)
                                    .join(", ")}
                                </p>
                                <p className="text-sm text-[#666]">
                                  {addr.city}, {addr.country}
                                </p>

                                {addr.id === defaultAddr?.id && (
                                  <span className="text-xs bg-stone-500 text-gray-50 px-2 py-1 rounded-full font-semibold tracking-wide">
                                    Default
                                  </span>
                                )}
                              </div>
                            </label>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const domain =
                              process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN;

                            if (!domain) {
                              console.error("Shopify domain not set");
                              return;
                            }

                            const url = domain.startsWith("http")
                              ? domain
                              : `https://${domain}`;

                            window.location.href = `${url.replace(/\/$/, "")}/account/addresses`;
                          }}
                          className="text-sm text-[#1a6cff] hover:underline flex items-center gap-1"
                        >
                          + Use a different address
                        </button>
                      </>
                    )}

                    {/* Guest or new address form */}
                    {(!isLoggedIn || !hasAddresses || useNewAddress) && (
                      <div className="flex flex-col gap-3">
                        {useNewAddress && (
                          <button
                            type="button"
                            onClick={() => setUseNewAddress(false)}
                            className="text-sm text-[#1a6cff] hover:underline self-start mb-1"
                          >
                            ← Use saved address
                          </button>
                        )}

                        {/* Country */}
                        <div className="relative">
                          <Combobox
                            value={customer.country}
                            onValueChange={(value) => {
                              if (!value) return;

                              setCustomer((c: any) => ({
                                ...c,
                                country: value,
                              }));
                            }}
                          >
                            {/* INPUT */}
                            <ComboboxInput
                              placeholder="Select country..."
                              className="w-full border border-[#d4d4d4] rounded-[6px] px-4 py-3 text-sm outline-none focus:border-[#1a1a1a]"
                            />

                            {/* DROPDOWN */}
                            <ComboboxContent className="max-h-72">
                              <ComboboxList>
                                <ComboboxEmpty>No country found.</ComboboxEmpty>

                                {countries.map((c) => (
                                  <ComboboxItem key={c.code} value={c.code}>
                                    {c.name}
                                  </ComboboxItem>
                                ))}
                              </ComboboxList>
                            </ComboboxContent>
                          </Combobox>
                        </div>

                        {/* Name row */}
                        <div className="flex gap-3">
                          <input
                            className="flex-1 border border-[#d4d4d4] rounded-[6px] px-4 py-3 text-sm outline-none focus:border-[#1a1a1a] transition-colors"
                            placeholder="First name"
                            value={customer.name.split(" ")[0] || ""}
                            onChange={(e) =>
                              setCustomer((c) => ({
                                ...c,
                                name:
                                  e.target.value +
                                  " " +
                                  c.name.split(" ").slice(1).join(" "),
                              }))
                            }
                          />
                          <input
                            className="flex-1 border border-[#d4d4d4] rounded-[6px] px-4 py-3 text-sm outline-none focus:border-[#1a1a1a] transition-colors"
                            placeholder="Last name (optional)"
                            value={
                              customer.name.split(" ").slice(1).join(" ") || ""
                            }
                            onChange={(e) =>
                              setCustomer((c) => ({
                                ...c,
                                name:
                                  c.name.split(" ")[0] + " " + e.target.value,
                              }))
                            }
                          />
                        </div>

                        {/* Address */}
                        <input
                          className="w-full border border-[#d4d4d4] rounded-[6px] px-4 py-3 text-sm outline-none focus:border-[#1a1a1a] transition-colors"
                          placeholder="Address"
                          value={customer.address}
                          onChange={(e) =>
                            setCustomer((c) => ({
                              ...c,
                              address: e.target.value,
                            }))
                          }
                        />

                        {/* City + Postal */}
                        <div className="flex gap-3">
                          <input
                            className="flex-1 border border-[#d4d4d4] rounded-[6px] px-4 py-3 text-sm outline-none focus:border-[#1a1a1a] transition-colors"
                            placeholder="City"
                            value={customer.city}
                            onChange={(e) =>
                              setCustomer((c) => ({
                                ...c,
                                city: e.target.value,
                              }))
                            }
                          />
                          <input
                            className="flex-1 border border-[#d4d4d4] rounded-[6px] px-4 py-3 text-sm outline-none focus:border-[#1a1a1a] transition-colors"
                            placeholder="Postal code (optional)"
                          />
                        </div>

                        {/* Phone */}
                        <input
                          className="w-full border border-[#d4d4d4] rounded-[6px] px-4 py-3 text-sm outline-none focus:border-[#1a1a1a] transition-colors"
                          placeholder="Phone"
                          type="tel"
                          value={customer.phone}
                          onChange={(e) =>
                            setCustomer((c) => ({
                              ...c,
                              phone: e.target.value,
                            }))
                          }
                        />

                        {!isLoggedIn && (
                          <label className="flex items-center gap-2 mt-1 text-sm text-[#555] cursor-pointer">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded"
                            />
                            Save this information for next time
                          </label>
                        )}
                      </div>
                    )}
                  </section>

                  {/* ── SHIPPING METHOD ── */}
                  {/* ── SHIPPING METHOD ── */}
                  <section className="mb-8 border-t border-b border-gray-300 py-4">
                    <p className="text-neutral-600 text-sm mb-3">
                      Shipping method
                    </p>

                    {ratesLoading ? (
                      <p className="text-sm text-gray-400">
                        Fetching shipping rates…
                      </p>
                    ) : shippingRates.length === 0 ? (
                      <p className="text-sm text-gray-400">
                        Enter your address to see shipping options.
                      </p>
                    ) : (
                      <div className="flex flex-col border rounded-md overflow-hidden">
                        {shippingRates.map((rate) => {
                          const isSelected =
                            selectedRate?.handle === rate.handle;
                          return (
                            <label
                              key={rate.handle}
                              className={`flex items-center justify-between gap-4 px-4 py-4 cursor-pointer transition border-b last:border-b-0 ${
                                isSelected
                                  ? "bg-[#f0f4ff]"
                                  : "bg-white hover:bg-[#fafafa]"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <input
                                  type="radio"
                                  name="shippingRate"
                                  checked={isSelected}
                                  onChange={() => setSelectedRate(rate)}
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
                                  : fmt(
                                      parseFloat(rate.price.amount),
                                      rate.price.currencyCode,
                                    )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {/* ── PAYMENT ── */}
                  <section className="mb-8">
                    <h2 className="text-lg font-semibold mb-1">Payment</h2>
                    <p className="text-sm text-[#777] mb-4">
                      All transactions are secure and encrypted.
                    </p>

                    <div className="border border-[#d4d4d4] rounded-[8px] overflow-hidden divide-y divide-[#e8e8e8]">
                      <label
                        className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors ${method === "stripe" ? "bg-[#f5f5f5]" : "bg-white hover:bg-[#fafafa]"}`}
                      >
                        <input
                          type="radio"
                          name="payment"
                          value="stripe"
                          checked={method === "stripe"}
                          onChange={() => setMethod("stripe")}
                          className="w-4 h-4 accent-[#1a1a1a]"
                        />
                        <span className="text-sm font-medium flex-1">
                          Credit / Debit Card
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Image
                            src={"/Stripe-logo.png"}
                            alt="Stripe"
                            width={60}
                            height={60}
                          />
                        </div>
                      </label>

                      {codAvailable && (
                        <label
                          className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors ${method === "cod" ? "bg-[#f5f5f5]" : "bg-white hover:bg-[#fafafa]"}`}
                        >
                          <input
                            type="radio"
                            name="payment"
                            value="cod"
                            checked={method === "cod"}
                            onChange={() => setMethod("cod")}
                            className="w-4 h-4 accent-[#1a1a1a]"
                          />
                          <span className="text-sm font-medium flex-1">
                            Cash on Delivery (COD)
                          </span>
                        </label>
                      )}
                    </div>

                    {method === "cod" && (
                      <p className="mt-2 text-sm text-[#666] bg-[#fffbea] border border-[#f0e5a0] rounded-[6px] px-3 py-2">
                        Pay when you receive your order. Our team will contact
                        you to confirm.
                      </p>
                    )}
                  </section>

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

          {/* ── RIGHT: order summary ── */}
        </div>
        <aside className="  shrink-0 bg-[#f5f5f5] border-l border-[#e0e0e0] px-8 py-10">
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
            {/* Discount code */}
            <div className="flex gap-2 mb-4">
              <input
                className="flex-1 border-2 border-[#d4d4d4] rounded-md p-4 text-sm bg-white outline-none focus:border-primary transition-colors"
                placeholder="Discount code"
                value={discountCode}
                onChange={(e) => {
                  setDiscountCode(e.target.value);
                  if (discountResult) setDiscountResult(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && applyDiscount()}
              />
              <button
                onClick={applyDiscount}
                disabled={discountLoading || !discountCode.trim()}
                className="border disabled:bg-gray-400 border-[#d4d4d4] rounded-md px-4 py-2.5 text-sm font-medium bg-primary text-white transition-colors"
              >
                {discountLoading ? "…" : "Apply"}
              </button>
            </div>

            {/* Discount feedback */}
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
                  <span>+ {fmt(codFee, "AED")}</span>
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
                        : fmt(shippingCost, shippingCurrency)}
                </span>
              </div>
              <div className="flex justify-between items-baseline border-t border-[#e0e0e0] pt-4 mt-1">
                <span className="text-base font-semibold">Total</span>
                <div className="text-right">
                  <span className="text-2xl font-bold">
                    {fmt(grandTotal, currency)}
                  </span>
                  {shippingCurrency !== currency && shippingCost > 0 && (
                    <p className="text-xs text-[#aaa] mt-0.5">
                      excl. {fmt(shippingCost, shippingCurrency)} shipping
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
