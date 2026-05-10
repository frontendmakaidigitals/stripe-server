"use client";

import { Copy, Mail } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import DeliveryDetails from "./delivery-details";
import OrderSummary from "./order-summary";
import { useState, useEffect } from "react";
// Inner component that uses useSearchParams
function SuccessContent() {
  const searchParams = useSearchParams();
  const provider = searchParams.get("provider");
  const sessionId = searchParams.get("session_id");
  const referenceId = searchParams.get("referenceId");

  const codData =
    provider === "cod"
      ? {
          orderId: searchParams.get("orderId"),
          name: searchParams.get("name"),
          email: searchParams.get("email"),
          phone: searchParams.get("phone"),
          address: searchParams.get("address"),
          city: searchParams.get("city"),
          country: searchParams.get("country"),
          provider: "cod",
        }
      : null;

  const [orderData, setOrderData] = useState<any>(codData);
  const [loading, setLoading] = useState(!codData);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (codData) return;

    const params = new URLSearchParams();
    if (provider) params.set("provider", provider);
    if (sessionId) params.set("session_id", sessionId);
    if (referenceId) params.set("referenceId", referenceId);

    fetch(`/api/order/success?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => setOrderData(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function copyOrderId() {
    if (!orderData?.orderId) return;
    navigator.clipboard.writeText(orderData.orderId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 place-items-center mt-10">
      <div className="flex flex-col items-center justify-center">
        <video className="size-20 mb-5" autoPlay muted playsInline>
          <source src="/order-success.webm" type="video/webm" />
        </video>
        <h1 className="text-3xl font-semibold mb-2">
          Thank you for your order!
        </h1>
        <p>Your order has been received and is being processed.</p>
      </div>
      <div className="relative border mt-5 border-gray-300 rounded-lg w-2xs h-16">
        {copied && (
          <span className="absolute size-full text-center flex justify-center items-center z-20 -top-7 right-0 text-xs text-green-600">
            Copied!
          </span>
        )}
        <button
          onClick={copyOrderId}
          className="absolute hover:bg-gray-200 p-2 transition-colors duration-200 rounded-md right-4 top-1/2 -translate-y-1/2"
        >
          <Copy className="size-5" />
        </button>
        <div className="absolute left-4 top-1/2 -translate-y-1/2">
          <p className="text-sm text-gray-500">Order number</p>
          <p className="font-semibold text-gray-900">
            {orderData?.orderId || "—"}
          </p>
        </div>
      </div>
      <h3 className="flex mb-8 items-center gap-2 mt-4 text-sm text-gray-500">
        <span>
          <Mail />
        </span>{" "}
        Order Confirmation sent to{" "}
        <span className="font-semibold text-gray-800">{orderData.email}</span>
      </h3>

      <div className="grid w-full max-w-5xl grid-cols-1 lg:grid-cols-[1.2fr_.8fr] gap-4">
        <div className="items-start">
          <OrderSummary
            items={orderData?.items}
            currency={orderData?.currency}
            shipping={orderData?.shipping}
            codFee={orderData?.codFee}
            discountAmount={orderData?.discountAmount}
            discountCode={orderData?.discountCode}
            isUAE={
              orderData?.customer?.country === "AE" ||
              orderData?.customer?.country === "United Arab Emirates"
            }
          />
        </div>
        <div className=" items-start">
          <DeliveryDetails customer={orderData} />
          <div className="mt-4 w-full">
            <a
              href={`https://${process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN}`}
              className="block w-full rounded-xl bg-primary px-5 py-3 text-center text-white hover:bg-primary/90"
            >
              Continue Shopping
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// Outer component wraps the inner one in Suspense
export default function PaymentSuccess() {
  return (
    <div className="min-h-screen ">
      <Suspense fallback={<Spinner />}>
        <SuccessContent />
      </Suspense>
    </div>
  );
}
