import { isTokenUsed } from "../lib/used-tokens";
import {
  verifyCheckoutToken,
  type CheckoutPayload,
} from "../lib/checkout-token";
import CheckoutClient from "./CheckoutClient";

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function CheckoutPage({ searchParams }: PageProps) {
  const { token } = await searchParams;

  if (!token) {
    return <TokenError message="No checkout session found." />;
  }
  if (await isTokenUsed(token)) {
    return (
      <TokenError message="This order has already been completed. Please return to the store." />
    );
  }
  let payload: CheckoutPayload;
  try {
    payload = await verifyCheckoutToken(token);
  } catch (err: unknown) {
    const isExpired = err instanceof Error && err.message.includes("expired");
    return (
      <TokenError
        message={
          isExpired
            ? "Your checkout session has expired. Please return to the store and try again."
            : "Invalid checkout session. Please return to the store."
        }
      />
    );
  }

  return <CheckoutClient payload={payload} />;
}

function TokenError({ message }: { message: string }) {
  const storeUrl = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN
    ? `https://${process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN}`
    : "https://perfumeoasis.ae";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center font-[DM_Sans,sans-serif] bg-[#f9f9f7] gap-4 p-8 text-center">
      <div className="text-[48px]">🔒</div>

      <h2 className="text-[22px] font-bold m-0">Session Unavailable</h2>

      <p className="text-[#666] text-[15px] max-w-[380px] m-0">{message}</p>

      <a
        href={storeUrl}
        className="mt-2 px-6 py-3 bg-[#111] text-white rounded-lg no-underline font-semibold text-sm"
      >
        ← Back to Store
      </a>
    </div>
  );
}
