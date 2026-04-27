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
    : "https://perfumeoasis.ae"; // fallback

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Sans', sans-serif",
        background: "#f9f9f7",
        gap: 16,
        padding: 32,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 48 }}>🔒</div>
      <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
        Session Unavailable
      </h2>
      <p style={{ color: "#666", fontSize: 15, maxWidth: 380, margin: 0 }}>
        {message}
      </p>
      <a
        href={storeUrl}
        style={{
          marginTop: 8,
          padding: "12px 24px",
          background: "#111",
          color: "#fff",
          borderRadius: 8,
          textDecoration: "none",
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        ← Back to Store
      </a>
    </div>
  );
}
