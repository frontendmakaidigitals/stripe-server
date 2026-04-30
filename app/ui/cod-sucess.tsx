// components/CODSuccess.tsx
"use client";

type Props = {
  orderId: string;
  phone: string;
  email: string;
};

export function CODSuccess({ orderId, phone, email }: Props) {
  return (
    <div className="mt-12 text-center">
      <div className="text-5xl mb-5">✅</div>
      <h2 className="text-2xl font-bold mb-3">Order confirmed!</h2>
      <p className="text-[#555] leading-relaxed mb-1">
        Your order{" "}
        <span className="font-semibold text-[#111]">#{orderId}</span> has been
        received.
      </p>
      <p className="text-[#555] leading-relaxed mb-1">
        We'll contact you at{" "}
        <span className="font-semibold text-[#111]">{phone}</span> to confirm
        delivery.
      </p>
      <p className="text-sm text-[#999] mt-2">
        Confirmation sent to{" "}
        <span className="font-semibold">{email}</span>.
      </p>
      <a
        href={`https://${process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN || "perfumeoasis.ae"}`}
        className="mt-8 inline-block text-sm font-semibold text-[#1a1a1a] underline underline-offset-4"
      >
        ← Back to store
      </a>
    </div>
  );
}