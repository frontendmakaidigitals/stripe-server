"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

export default function CheckoutPage() {
  const searchParams = useSearchParams();
  const productTitle = searchParams.get("title");
  const productPrice = searchParams.get("price");
  const variantId = searchParams.get("variantId");

  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    setLoading(true);
    const res = await fetch("/api/stripe/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variantId, productTitle, productPrice }),
    });
    const data = await res.json();
    window.location.href = data.url; // redirect to Stripe
  };

  return (
    <div
      style={{
        fontFamily: "sans-serif",
        padding: "40px",
        maxWidth: "400px",
        margin: "auto",
      }}
    >
      <h2>Checkout</h2>
      <p>
        <strong>{productTitle}</strong>
      </p>
      <p>Price: ${productPrice}</p>
      <button
        onClick={handleCheckout}
        disabled={loading}
        style={{
          padding: "12px 24px",
          background: "#000",
          color: "#fff",
          border: "none",
          cursor: "pointer",
          borderRadius: "6px",
        }}
      >
        {loading ? "Processing..." : "Pay with Stripe"}
      </button>
    </div>
  );
}
