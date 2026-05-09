// components/ContactSection.tsx
"use client";
import { useFormContext } from "react-hook-form";
import { useCheckoutContext } from "../checkout/checkoutContext";

export function ContactSection({ isLoggedIn }: { isLoggedIn: boolean }) {
  const { customer } = useCheckoutContext();
  const {
    register,
    formState: { errors },
  } = useFormContext();

  if (isLoggedIn) {
    return (
      <div className="mb-5 flex items-center justify-between border-b border-gray-300 py-3">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-full bg-neutral-100 border border-gray-300 flex items-center justify-center text-sm font-semibold text-[#444]">
            {customer.email.charAt(0).toUpperCase()}
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
          className="text-sm px-3 py-1.5 rounded-full hover:bg-blue-100 text-[#1a6cff]"
        >
          Sign in
        </a>
      </div>
      <input
        className={`w-full border  rounded-[6px] px-4 py-3 text-sm outline-none focus:border-[#1a1a1a] transition-colors ${errors.email ? "border-red-400! placeholder:text-red-500 bg-red-50" : "border-[#d4d4d4]"}`}
        type="email"
        placeholder="Email"
        {...register("email")}
      />
    </section>
  );
}
