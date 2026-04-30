// components/PaymentSection.tsx
"use client";

import Image from "next/image";
import type { PaymentMethod } from "@/types/checkout.types";

type Props = {
  method: PaymentMethod;
  codAvailable: boolean;
  onChange: (m: PaymentMethod) => void;
};

export function PaymentSection({ method, codAvailable, onChange }: Props) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-1">Payment</h2>
      <p className="text-sm text-[#777] mb-4">
        All transactions are secure and encrypted.
      </p>

      <div className="border border-[#d4d4d4] rounded-[8px] overflow-hidden divide-y divide-[#e8e8e8]">
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

      {method === "cod" && (
        <p className="mt-2 text-sm text-[#666] bg-[#fffbea] border border-[#f0e5a0] rounded-[6px] px-3 py-2">
          Pay when you receive your order. Our team will contact you to confirm.
        </p>
      )}
    </section>
  );
}