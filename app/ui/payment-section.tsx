"use client";
import { useCheckoutContext } from "../checkout/checkoutContext";
import Image from "next/image";
import type { PaymentMethod } from "@/types/checkout.types";

type Props = {
  error?: string;
  isTabbyAvailable: boolean;
  onChange: (m: PaymentMethod) => void;
};

export function PaymentSection({ error, isTabbyAvailable, onChange }: Props) {
  const { method, totals } = useCheckoutContext();
  const { codAvailable } = totals;

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-1">Payment</h2>
      <p className="text-sm text-[#777] mb-4">
        All transactions are secure and encrypted.
      </p>

      <div
        className={`border rounded-[8px] overflow-hidden divide-y divide-[#e8e8e8] ${
          error ? "border-[#dc2626]" : "border-[#d4d4d4]"
        }`}
      >
        {/* Stripe */}
        <label
          className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors ${
            method === "stripe" ? "bg-[#f5f5f5]" : "bg-white hover:bg-[#fafafa]"
          }`}
        >
          <input
            type="radio"
            name="payment"
            value="stripe"
            checked={method === "stripe"}
            onChange={() => onChange("stripe")}
            className="w-4 h-4 accent-[#1a1a1a]"
          />
          <span className="text-sm font-medium flex-1">
            Credit / Debit Card
          </span>
          <div className="flex items-center gap-1.5">
            <Image src="/Stripe-logo.png" alt="Stripe" width={60} height={60} />
          </div>
        </label>

        {isTabbyAvailable && (
          <label
            className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors ${
              method === "tabby"
                ? "bg-[#f5f5f5]"
                : "bg-white hover:bg-[#fafafa]"
            }`}
          >
            <input
              type="radio"
              name="payment"
              value="tabby"
              checked={method === "tabby"}
              onChange={() => onChange("tabby")}
              className="w-4 h-4 accent-[#1a1a1a]"
            />
            <span className="text-sm font-medium flex-1">
              Pay in 4 — Interest-free
            </span>
            <Image src="/tabby-logo.png" alt="Tabby" width={60} height={24} />
          </label>
        )}

        {/* Tamara */}
        <label
          className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors ${
            method === "tamara" ? "bg-[#f5f5f5]" : "bg-white hover:bg-[#fafafa]"
          }`}
        >
          <input
            type="radio"
            name="payment"
            value="tamara"
            checked={method === "tamara"}
            onChange={() => onChange("tamara")}
            className="w-4 h-4 accent-[#1a1a1a]"
          />
          <span className="text-sm font-medium flex-1">
            Split in 3 — No interest
          </span>
          <Image src="/tamara.png" alt="Tamara" width={72} height={24} />
        </label>

        {/* COD */}
        {codAvailable && (
          <label
            className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors ${
              method === "cod" ? "bg-[#f5f5f5]" : "bg-white hover:bg-[#fafafa]"
            }`}
          >
            <input
              type="radio"
              name="payment"
              value="cod"
              checked={method === "cod"}
              onChange={() => onChange("cod")}
              className="w-4 h-4 accent-[#1a1a1a]"
            />
            <span className="text-sm font-medium flex-1">
              Cash on Delivery (COD)
            </span>
          </label>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-[#dc2626]">{error}</p>}

      {method === "cod" && (
        <p className="mt-2 text-sm text-[#666] bg-[#fffbea] border border-[#f0e5a0] rounded-[6px] px-3 py-2">
          Pay when you receive your order. Our team will contact you to confirm.
        </p>
      )}
      {method === "tabby" && (
        <p className="mt-2 text-sm text-[#666] bg-[#f0faf4] border border-[#a8e0bc] rounded-[6px] px-3 py-2">
          Split into 4 interest-free payments. No fees if you pay on time.
        </p>
      )}
      {method === "tamara" && (
        <p className="mt-2 text-sm text-[#666] bg-[#f0f7ff] border border-[#a8ccf0] rounded-[6px] px-3 py-2">
          Split your purchase into 3 easy payments. Zero interest, zero fees.
        </p>
      )}
    </section>
  );
}
