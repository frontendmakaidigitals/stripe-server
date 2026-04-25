"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function PaymentSuccess() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  return (
    <div className="min-h-screen flex items-center justify-center bg-green-50 px-4">
      <div className="bg-white shadow-xl rounded-2xl p-8 max-w-md w-full text-center">
        <div className="text-green-600 text-5xl mb-4">✔</div>

        <h1 className="text-2xl font-semibold mb-2">Payment Successful!</h1>

        <p className="text-gray-600 mb-4">
          Thank you for your purchase. Your payment has been processed
          successfully.
        </p>

        {sessionId && (
          <p className="text-xs text-gray-400 mb-4">Session ID: {sessionId}</p>
        )}

        <Link
          href="/"
          className="inline-block mt-4 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
        >
          Go to Home
        </Link>
      </div>
    </div>
  );
}
