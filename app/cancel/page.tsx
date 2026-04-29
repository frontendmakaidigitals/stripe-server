"use client";

import { useRouter } from "next/navigation";

export default function CancelPage() {
  const router = useRouter();

  return (
    <div className="p-6 text-center">
      <h1 className="text-lg font-semibold mb-2">Payment cancelled</h1>
      <p className="text-sm text-gray-500 mb-4">
        You can go back and try again.
      </p>

      <button
        onClick={() => router.back()}
        className="px-4 py-2 bg-black text-white rounded"
      >
        Go Back
      </button>
    </div>
  );
}
