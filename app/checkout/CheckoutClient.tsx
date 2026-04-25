"use client";
// app/checkout/CheckoutClient.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Client component — receives pre-decoded payload from server page.
// Handles: payment method selection, form pre-fill, Stripe redirect, COD order.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import type { CheckoutPayload, CustomerInfo } from "../lib/checkout-token";

type PaymentMethod = "stripe" | "cod" | null;
type Step = "select" | "details" | "cod-success";

function fmt(cents: number, currency: string) {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export default function CheckoutClient({
  payload,
}: {
  payload: CheckoutPayload;
}) {
  const { items, currency, total, customer: prefill } = payload;

  const isLoggedIn = Boolean(prefill.email);

  const [method, setMethod] = useState<PaymentMethod>(null);
  const [step, setStep] = useState<Step>("select");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState("");

  // Form state — pre-filled from JWT if logged in
  const [customer, setCustomer] = useState<CustomerInfo>({
    id: prefill.id || "",
    name: prefill.name || "",
    email: prefill.email || "",
    phone: prefill.phone || "",
    address: prefill.address || "",
    city: prefill.city || "",
    country: prefill.country || "AE",
  });

  const allFilled =
    customer.name &&
    customer.email &&
    customer.phone &&
    customer.address &&
    customer.city;

  // ── Stripe ──────────────────────────────────────────────────────────────────
  async function startStripe() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, currency, customer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Stripe checkout failed");
      window.location.href = data.url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  // ── COD ─────────────────────────────────────────────────────────────────────
  async function placeCODOrder() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/orders/cod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, currency, customer }),
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

  // ── Continue from method selection ──────────────────────────────────────────
  function handleContinue() {
    if (!method) return;
    // If logged in and all details present, skip the details form
    if (isLoggedIn && allFilled) {
      method === "stripe" ? startStripe() : placeCODOrder();
    } else {
      setStep("details");
    }
  }

  // ── Submit details form ──────────────────────────────────────────────────────
  function handleDetailsSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allFilled) return;
    method === "stripe" ? startStripe() : placeCODOrder();
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={s.page}>
      {/* ── Left: Order summary ──────────────────────────────────────────── */}
      <aside style={s.sidebar}>
        <div style={s.sidebarInner}>
          <p style={s.overline}>Your Order</p>

          <div style={s.itemList}>
            {items.map((item, i) => (
              <div key={i} style={s.item}>
                {item.image && (
                  <img
                    src={item.image}
                    alt={item.product_title}
                    style={s.itemImg}
                  />
                )}
                <div style={s.itemMeta}>
                  <p style={s.itemName}>{item.product_title}</p>
                  <p style={s.itemQty}>× {item.quantity}</p>
                </div>
                <p style={s.itemPrice}>
                  {fmt(item.price * item.quantity, currency)}
                </p>
              </div>
            ))}
          </div>

          <div style={s.hr} />

          <div style={s.totalRow}>
            <span style={s.totalLabel}>Total</span>
            <span style={s.totalAmt}>{fmt(total, currency)}</span>
          </div>

          {isLoggedIn && (
            <div style={s.loggedInBadge}>
              <span>👤</span>
              <span>Signed in as {customer.name || customer.email}</span>
            </div>
          )}
        </div>
      </aside>

      {/* ── Right: Checkout steps ────────────────────────────────────────── */}
      <main style={s.main}>
        <div style={s.mainInner}>
          <h1 style={s.heading}>Checkout</h1>

          {/* ── Step: method selection + details ─────────────────────────── */}
          {(step === "select" || step === "details") && (
            <>
              {/* Payment method cards */}
              <p style={s.stepLabel}>How would you like to pay?</p>
              <div style={s.methodGrid}>
                {(["stripe", "cod"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    style={{
                      ...s.methodCard,
                      ...(method === m ? s.methodCardActive : {}),
                    }}
                    onClick={() => {
                      setMethod(m);
                      if (step === "details") setStep("select");
                    }}
                  >
                    <span style={s.methodIcon}>
                      {m === "stripe" ? "💳" : "💵"}
                    </span>
                    <span style={s.methodTitle}>
                      {m === "stripe"
                        ? "Credit / Debit Card"
                        : "Cash on Delivery"}
                    </span>
                    <span style={s.methodDesc}>
                      {m === "stripe"
                        ? "Secure payment via Stripe"
                        : "Pay when you receive your order"}
                    </span>
                    {method === m && <span style={s.tick}>✓</span>}
                  </button>
                ))}
              </div>

              {/* Details form — shown when not fully pre-filled */}
              {step === "details" && (
                <form onSubmit={handleDetailsSubmit} style={s.form}>
                  <p style={{ ...s.stepLabel, marginTop: 8 }}>
                    Delivery Details
                  </p>

                  <Row>
                    <Field label="Full Name *">
                      <input
                        style={s.input}
                        required
                        value={customer.name}
                        onChange={(e) =>
                          setCustomer((c) => ({ ...c, name: e.target.value }))
                        }
                        placeholder="Jane Doe"
                      />
                    </Field>
                    <Field label="Email *">
                      <input
                        style={s.input}
                        required
                        type="email"
                        value={customer.email}
                        onChange={(e) =>
                          setCustomer((c) => ({ ...c, email: e.target.value }))
                        }
                        placeholder="jane@example.com"
                      />
                    </Field>
                  </Row>

                  <Row>
                    <Field label="Phone *">
                      <input
                        style={s.input}
                        required
                        type="tel"
                        value={customer.phone}
                        onChange={(e) =>
                          setCustomer((c) => ({ ...c, phone: e.target.value }))
                        }
                        placeholder="+971 50 000 0000"
                      />
                    </Field>
                    <Field label="City *">
                      <input
                        style={s.input}
                        required
                        value={customer.city}
                        onChange={(e) =>
                          setCustomer((c) => ({ ...c, city: e.target.value }))
                        }
                        placeholder="Dubai"
                      />
                    </Field>
                  </Row>

                  <Field label="Delivery Address *" full>
                    <input
                      style={s.input}
                      required
                      value={customer.address}
                      onChange={(e) =>
                        setCustomer((c) => ({ ...c, address: e.target.value }))
                      }
                      placeholder="Building, Street, Area"
                    />
                  </Field>

                  {error && <ErrorBox msg={error} />}

                  <button
                    type="submit"
                    style={{ ...s.cta, opacity: loading ? 0.6 : 1 }}
                    disabled={loading}
                  >
                    {loading
                      ? "Processing…"
                      : method === "stripe"
                        ? "Continue to Payment →"
                        : "Place Order →"}
                  </button>
                </form>
              )}

              {/* CTA on method-select step */}
              {step === "select" && (
                <>
                  {error && <ErrorBox msg={error} />}
                  {/* If logged in and all info present, show what will be used */}
                  {isLoggedIn && allFilled && method && (
                    <div style={s.prefillNote}>
                      <p style={s.prefillTitle}>Delivering to:</p>
                      <p style={s.prefillLine}>
                        {customer.name} · {customer.email}
                      </p>
                      <p style={s.prefillLine}>
                        {customer.address}, {customer.city}
                      </p>
                      <p style={s.prefillLine}>{customer.phone}</p>
                      <button
                        type="button"
                        style={s.editBtn}
                        onClick={() => setStep("details")}
                      >
                        Edit details
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    style={{
                      ...s.cta,
                      opacity: !method || loading ? 0.4 : 1,
                      cursor: !method ? "not-allowed" : "pointer",
                      marginTop: 16,
                    }}
                    disabled={!method || loading}
                    onClick={handleContinue}
                  >
                    {loading ? "Processing…" : "Continue →"}
                  </button>
                </>
              )}
            </>
          )}

          {/* ── COD success ──────────────────────────────────────────────── */}
          {step === "cod-success" && (
            <div style={s.successBox}>
              <div style={s.successIcon}>✅</div>
              <h2 style={s.successTitle}>Order Placed!</h2>
              <p style={s.successBody}>
                Your order <strong>{orderId}</strong> has been received. Our
                team will contact you on <strong>{customer.phone}</strong> to
                confirm delivery.
              </p>
              <p style={s.successSub}>
                Confirmation sent to <strong>{customer.email}</strong>.
              </p>
              <a
                href={`https://${process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN}`}
                style={s.backLink}
              >
                ← Back to Store
              </a>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ─── Small layout helpers ──────────────────────────────────────────────────────

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 16 }}>{children}</div>;
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        flex: full ? "1 1 100%" : 1,
      }}
    >
      <label
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          color: "#555",
          textTransform: "uppercase",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div
      style={{
        padding: "10px 14px",
        background: "#fef2f2",
        border: "1px solid #fecaca",
        borderRadius: 8,
        color: "#dc2626",
        fontSize: 13,
      }}
    >
      {msg}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    display: "flex",
    minHeight: "100vh",
    fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
    background: "#f9f9f7",
    color: "#111",
  },
  sidebar: {
    width: 360,
    background: "#111",
    color: "#fff",
    padding: "52px 36px",
    flexShrink: 0,
  },
  sidebarInner: { position: "sticky", top: 52 },
  overline: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#666",
    marginBottom: 28,
  },
  itemList: { display: "flex", flexDirection: "column", gap: 16 },
  item: { display: "flex", alignItems: "center", gap: 12 },
  itemImg: {
    width: 48,
    height: 48,
    objectFit: "cover",
    borderRadius: 6,
    border: "1px solid #2a2a2a",
  },
  itemMeta: { flex: 1 },
  itemName: { margin: 0, fontSize: 14, fontWeight: 500, lineHeight: 1.4 },
  itemQty: { margin: 0, fontSize: 12, color: "#666", marginTop: 2 },
  itemPrice: { margin: 0, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" },
  hr: { height: 1, background: "#222", margin: "28px 0" },
  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  totalLabel: {
    fontSize: 12,
    color: "#777",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  totalAmt: { fontSize: 24, fontWeight: 700 },
  loggedInBadge: {
    marginTop: 24,
    padding: "10px 14px",
    background: "#1a1a1a",
    borderRadius: 8,
    display: "flex",
    gap: 8,
    alignItems: "center",
    fontSize: 13,
    color: "#aaa",
    border: "1px solid #2a2a2a",
  },
  main: {
    flex: 1,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "64px 56px",
  },
  mainInner: { width: "100%", maxWidth: 520 },
  heading: {
    fontSize: 26,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    marginBottom: 36,
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#888",
    marginBottom: 14,
  },
  methodGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14,
    marginBottom: 28,
  },
  methodCard: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 3,
    padding: "18px 18px",
    border: "1.5px solid #e5e5e5",
    borderRadius: 12,
    background: "#fff",
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.15s",
  },
  methodCardActive: {
    border: "1.5px solid #111",
    boxShadow: "0 0 0 3px rgba(0,0,0,0.07)",
  },
  methodIcon: { fontSize: 22, marginBottom: 4 },
  methodTitle: { fontSize: 14, fontWeight: 700, color: "#111" },
  methodDesc: { fontSize: 12, color: "#999" },
  tick: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 18,
    height: 18,
    borderRadius: "50%",
    background: "#111",
    color: "#fff",
    fontSize: 11,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
  },
  prefillNote: {
    padding: "16px 18px",
    background: "#fff",
    border: "1.5px solid #e5e5e5",
    borderRadius: 10,
    marginBottom: 4,
  },
  prefillTitle: {
    margin: "0 0 6px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: "#888",
    textTransform: "uppercase",
  },
  prefillLine: { margin: "2px 0", fontSize: 14, color: "#333" },
  editBtn: {
    marginTop: 10,
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 13,
    color: "#111",
    fontWeight: 600,
    cursor: "pointer",
    textDecoration: "underline",
  },
  form: { display: "flex", flexDirection: "column", gap: 14 },
  input: {
    padding: "11px 13px",
    border: "1.5px solid #e5e5e5",
    borderRadius: 8,
    fontSize: 14,
    outline: "none",
    background: "#fff",
    fontFamily: "inherit",
    width: "100%",
    boxSizing: "border-box",
  },
  cta: {
    padding: "15px 24px",
    background: "#111",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    width: "100%",
    transition: "opacity 0.15s",
    fontFamily: "inherit",
    letterSpacing: "-0.01em",
  },
  successBox: {
    textAlign: "center",
    padding: "52px 36px",
    background: "#fff",
    borderRadius: 16,
    border: "1.5px solid #e5e5e5",
  },
  successIcon: { fontSize: 44, marginBottom: 16 },
  successTitle: { fontSize: 22, fontWeight: 700, margin: "0 0 12px" },
  successBody: {
    fontSize: 15,
    color: "#444",
    lineHeight: 1.7,
    margin: "0 0 8px",
  },
  successSub: { fontSize: 13, color: "#999" },
  backLink: {
    display: "inline-block",
    marginTop: 28,
    color: "#111",
    fontWeight: 600,
    fontSize: 14,
    textDecoration: "none",
    borderBottom: "1.5px solid #111",
    paddingBottom: 2,
  },
};
