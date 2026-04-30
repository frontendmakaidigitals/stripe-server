// components/ContactSection.tsx
"use client";

import { CustomerInfo } from "@/types/checkout.types";

type Props = {
  customer: CustomerInfo;
  isLoggedIn: boolean;
  onChange: (c: CustomerInfo) => void;
};

export function ContactSection({ customer, isLoggedIn, onChange }: Props) {
  if (isLoggedIn) {
    return (
      <div className="mb-5 flex items-center justify-between border-b border-gray-300 py-3">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-full bg-neutral-100 border border-gray-300 flex items-center justify-center text-sm font-semibold text-[#444]">
            {(customer.name || customer.email).charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-medium">{customer.email}</span>
        </div>
      </div>
    );
  }

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Contact</h2>
        <a
          href={`https://${process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN}/account/login`}
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
        onChange={(e) => onChange({ ...customer, email: e.target.value })}
      />
      <label className="flex items-center gap-2 mt-3 text-sm text-[#555] cursor-pointer">
        <input type="checkbox" className="w-4 h-4 rounded" />
        Email me with news and offers
      </label>
    </section>
  );
}