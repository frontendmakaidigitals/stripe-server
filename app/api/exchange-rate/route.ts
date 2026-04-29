import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = (searchParams.get("from") ?? "AED").toLowerCase();
  const to = (searchParams.get("to") ?? "USD").toLowerCase();

  if (from === to) return NextResponse.json({ rate: 1 });

  // Primary URL, fallback URL (the API provides both)
  const urls = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${from}.json`,
    `https://latest.currency-api.pages.dev/v1/currencies/${from}.json`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { next: { revalidate: 3600 } });
      if (!res.ok) continue;

      const data = await res.json();
      const rate = data?.[from]?.[to];

      if (!rate) {
        console.warn(`[ExchangeRate] Rate ${from}→${to} not found in response`);
        continue;
      }

      return NextResponse.json({ rate });
    } catch (err) {
      console.warn(`[ExchangeRate] Failed fetching ${url}:`, err);
    }
  }

  // Both URLs failed — return 1 so checkout doesn't break
  console.error(`[ExchangeRate] All sources failed for ${from}→${to}, using fallback rate 1`);
  return NextResponse.json({ rate: 1 });
}