// app/api/auth/checkout-token/route.ts

import { NextRequest, NextResponse } from "next/server";
import { signCheckoutToken } from "@/app/lib/checkout-token";
import type { CustomerInfo } from "@/types/checkout.types";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const SHOPIFY_DOMAIN = process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN!;
const SHOPIFY_TOKEN  = process.env.SHOPIFY_ACCESS_TOKEN!;

const ALLOWED_ORIGINS = [
  "https://perfumeoasis.ae",
  "https://www.perfumeoasis.ae",
  `https://${SHOPIFY_DOMAIN}`,
];

// ── CORS ──────────────────────────────────────────────────────────────────────
function corsHeaders(origin: string | null) {
  const allowed = ALLOWED_ORIGINS.includes(origin ?? "")
    ? origin!
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

// ── IP extraction (custom server — trust X-Real-IP set by nginx) ──────────────
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp    = request.headers.get("x-real-ip");

  console.log("[IP Debug]", { "x-forwarded-for": forwarded, "x-real-ip": realIp }); // ← move up

  if (forwarded) return forwarded.split(",")[0].trim();
  return realIp?.trim() ?? "unknown";
}


// ── Country from IP (cached in Redis) ────────────────────────────────────────
async function getCountryFromIp(ip: string): Promise<string> {
  if (!ip || ip === "unknown" || ip === "127.0.0.1" || ip.startsWith("::")) {
    return "AE"; // localhost / unknown → treat as UAE
  }

  // Check cache first
  try {
    const cached = await redis.get<string>(`ip_country:${ip}`);
    if (cached) return cached;
  } catch {
    // redis failure — continue to live lookup
  }

  try {
    const res = await fetch(`https://ipapi.co/${ip}/country/`, {
      headers: { "User-Agent": "perfumeoasis-checkout/1.0" },
      signal:  AbortSignal.timeout(3000), // 3s timeout
    });
    if (!res.ok) return "AE";

    const country = (await res.text()).trim();

    // Cache for 24h
    await redis.set(`ip_country:${ip}`, country, { ex: 60 * 60 * 24 }).catch(() => {});

    return country;
  } catch {
    return "AE"; // fail open — don't block checkout if IP lookup fails
  }
}

// ── Rate limiting (10 req/min per IP) ────────────────────────────────────────
async function isRateLimited(ip: string): Promise<boolean> {
  try {
    const key   = `token_rate:${ip}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60);
    return count > 10;
  } catch {
    return false; // fail open
  }
}

// ── Shopify variant prices ────────────────────────────────────────────────────
async function fetchShopifyVariants(variantIds: string[]) {
  const gids = variantIds.map((id) => `"gid://shopify/ProductVariant/${id}"`);

  const query = `{
    nodes(ids: [${gids.join(",")}]) {
      ... on ProductVariant {
        id
        sku
        price
        title
        product {
          title
          featuredImage { url }
        }
      }
    }
  }`;

  const res = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/graphql.json`,
    {
      method:  "POST",
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_TOKEN,
        "Content-Type":           "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );

  if (!res.ok) throw new Error(`Shopify API error: ${res.status}`);

  const { data, errors } = await res.json();
  if (errors?.length) throw new Error(errors[0].message);

  return (data.nodes as any[]).map((node) => ({
    variant_id:    node.id.replace("gid://shopify/ProductVariant/", ""),
    sku:           node.sku           || "",
    priceAED:      parseFloat(node.price),
    product_title: node.product.title || "",
    image:         node.product.featuredImage?.url || "",
  }));
}

// ── Validate conversion rate ──────────────────────────────────────────────────
async function validateConversionRate(
  clientRate: number,
  currency: string,
): Promise<boolean> {
  if (currency === "AED") return true;

  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/AED", {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return true; // fail open

    const data       = await res.json();
    const serverRate = data.rates[currency];
    if (!serverRate) return true;

    const diff = Math.abs(clientRate - serverRate) / serverRate;
    return diff <= 0.08; // allow 8% tolerance for Bucks markup
  } catch {
    return true; // fail open
  }
}

// ── OPTIONS ───────────────────────────────────────────────────────────────────
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const origin  = request.headers.get("origin");
  const headers = corsHeaders(origin);

  // Block unknown origins
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return NextResponse.json(
      { error: "Unauthorized origin" },
      { status: 403, headers },
    );
  }

  const ip = getClientIp(request);

  // Rate limit
  if (await isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers },
    );
  }

  try {
    const body = await request.json();
    const {
      items,
      currency,
      customer,
      shop,
      timestamp,
    } = body;

    // ── Field validation ──────────────────────────────────────────────────
    if (!items?.length || !currency || !shop || !timestamp) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400, headers },
      );
    }

    // ── Timestamp check ───────────────────────────────────────────────────
    const ageSeconds = Math.floor(Date.now() / 1000) - timestamp;
    if (ageSeconds > 300 || ageSeconds < -30) {
      return NextResponse.json(
        { error: "Request expired" },
        { status: 401, headers },
      );
    }

    // ── Shop validation ───────────────────────────────────────────────────
    if (shop !== SHOPIFY_DOMAIN) {
      return NextResponse.json(
        { error: "Unauthorized shop" },
        { status: 403, headers },
      );
    }
// ── Fetch live conversion rate server-side ────────────────────────────────
  async function getConversionRate(currency: string): Promise<number> {
  if (currency === "AED") return 1;
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/AED", {
      signal: AbortSignal.timeout(3000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return 1;
    const data = await res.json();
    const rate = data.rates[currency];
    if (!rate) return 1;
    return parseFloat(rate.toFixed(6)); // ← removed * 1.03
  } catch {
    return 1;
  }
}
    const conversionRate = await getConversionRate(currency);

    // ── Country & markup ──────────────────────────────────────────────────
    const country  = await getCountryFromIp(ip);
    const isUAE    = country === "AE";
    const markup   = isUAE ? 1 : 1.03;


    // ── Fetch real prices from Shopify ────────────────────────────────────
    const variantIds = items.map((i: any) => String(i.variant_id));
    const variants   = await fetchShopifyVariants(variantIds);
    console.log("[checkout-token] currency:", currency);
console.log("[checkout-token] conversionRate:", conversionRate);
console.log("[checkout-token] markup:", markup);
console.log("[checkout-token] variants from Shopify:", JSON.stringify(variants, null, 2));
console.log("[checkout-token] secureItems will be:", items.map((item: any) => {
  const variant = variants.find((v) => v.variant_id === String(item.variant_id));
  if (!variant) return { error: `variant not found: ${item.variant_id}` };
  const priceAEDWithMarkup = parseFloat((variant.priceAED * markup).toFixed(2));
  const priceInCurrency = parseFloat((priceAEDWithMarkup * conversionRate).toFixed(2));
  return {
    variant_id: variant.variant_id,
    priceAED: variant.priceAED,
    markup,
    priceAEDWithMarkup,
    conversionRate,
    priceInCurrency,
  };
}));

    // ── Build secure items ────────────────────────────────────────────────
    const secureItems = items.map((item: any) => {
  const variant = variants.find(
    (v) => v.variant_id === String(item.variant_id),
  );
  if (!variant) throw new Error(`Invalid variant: ${item.variant_id}`);

  const priceAEDWithMarkup = parseFloat(
    (variant.priceAED * markup).toFixed(2),
  );
  const priceInCurrency = parseFloat(
    (priceAEDWithMarkup * conversionRate).toFixed(2), // now uses server rate
  );

  return {
    variant_id:    variant.variant_id,
    sku:           variant.sku,
    product_title: variant.product_title,
    image:         variant.image,
    quantity:      item.quantity,
    price:         priceInCurrency,    // display currency — server-calculated
    price_aed:     priceAEDWithMarkup, // AED for Shopify
  };
});

    const secureTotal = parseFloat(
      secureItems
        .reduce((sum: number, i: any) => sum + i.price * i.quantity, 0)
        .toFixed(2),
    );

    // ── Safe customer ─────────────────────────────────────────────────────
    const safeCustomer: CustomerInfo = {
      id:          customer?.id          || "",
      name:        customer?.name        || "",
      email:       customer?.email       || "",
      phone:       customer?.phone       || "",
      address:     customer?.address     || "",
      city:        customer?.city        || "",
      country:     customer?.country     || "AE",
      addresses:   customer?.addresses   ?? [],
      countryCode: customer?.countryCode || "AE",
    };

    // ── Sign token ────────────────────────────────────────────────────────
    const token = await signCheckoutToken({
      items:    secureItems,
      currency,
      total:    secureTotal,
      customer: safeCustomer,
      shop,
       conversion_rate: conversionRate,
    });

    return NextResponse.json({ token }, { headers });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Token generation failed";
    console.error("[checkout-token] Error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500, headers },
    );
  }
}