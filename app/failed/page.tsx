"use client";

import Link from "next/link";

export default function PaymentCancelled() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-red-50 px-4">
      <div className="bg-white shadow-xl rounded-2xl p-8 max-w-md w-full text-center">
        <div className="text-red-600 text-5xl mb-4">✖</div>

        <h1 className="text-2xl font-semibold mb-2">Payment Failed</h1>

        <p className="text-gray-600 mb-4">
          Your payment was not completed. You can try again anytime.
        </p>

        <div className="flex gap-3 justify-center mt-4">
          <Link
            href="/checkout"
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            Try Again
          </Link>

          <Link
            href="/"
            className="px-6 py-2 border rounded-lg hover:bg-gray-100 transition"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
