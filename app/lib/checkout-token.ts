
import { CheckoutPayload } from "@/types/checkout.types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function base64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function importKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

// ─── Sign ─────────────────────────────────────────────────────────────────────

export async function signCheckoutToken(
  payload: CheckoutPayload,
  expiresInSeconds = 900, // 15 minutes
): Promise<string> {
  const secret = process.env.CHECKOUT_TOKEN_SECRET;
  if (!secret) throw new Error("CHECKOUT_TOKEN_SECRET env var is not set");

  const header = base64url(
    new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );

  const body = base64url(
    new TextEncoder().encode(
      JSON.stringify({
        ...payload,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
      }),
    ),
  );

  const key = await importKey(secret);
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${header}.${body}`),
  );

  return `${header}.${body}.${base64url(sigBuf)}`;
}

// ─── Verify ───────────────────────────────────────────────────────────────────

export async function verifyCheckoutToken(
  token: string,
): Promise<CheckoutPayload> {
  const secret = process.env.CHECKOUT_TOKEN_SECRET;
  if (!secret) throw new Error("CHECKOUT_TOKEN_SECRET env var is not set");

  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format");

  const [header, body, sig] = parts;

  // Verify signature
  const key = await importKey(secret);
  const sigBytes = Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    new TextEncoder().encode(`${header}.${body}`),
  );
  if (!valid) throw new Error("Invalid token signature");

  // Decode payload
  const decoded = JSON.parse(
    Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"),
  );

  // Check expiry
  if (decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token has expired");
  }

  return decoded as CheckoutPayload;
}