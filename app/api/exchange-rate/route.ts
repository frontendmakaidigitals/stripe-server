// app/api/exchange-rate/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = (searchParams.get("from") ?? "AED").toUpperCase();
  const to = (searchParams.get("to") ?? "USD").toUpperCase();

  if (from === to) return NextResponse.json({ rate: 1 });

  try {
    // Uses the free, no-key-required frankfurter.app API
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=${from}&to=${to}`,
      { next: { revalidate: 3600 } }
    );
    const data = await res.json();
    const rate = data?.rates?.[to];
    if (!rate) throw new Error("Rate not found");
    return NextResponse.json({ rate });
  } catch (err) {
    console.error("[ExchangeRate] Error:", err);
    return NextResponse.json({ rate: 1 }); // fallback: no conversion
  }
}