"use client";

import { useRouter } from "next/navigation";

export default function CancelPage() {
  const router = useRouter();

  return (
    <div className="bg-neutral-100 max-w-lg rounded-2xl mx-auto my-auto p-10">
      <div className="grid grid-cols-1 place-items-center">
        <video muted playsInline autoPlay className="size-24 mb-5 ">
          <source src={"/payment-failed.webm"} type="video/webm" />
        </video>
        <h1 className="text-3xl font-semibold mb-3">Payment cancelled</h1>
        <p className="text-sm text-gray-500 mb-5">
          Your last transaction was cancelled
        </p>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded"
        >
         Visit Store 
        </button>
      </div>
    </div>
  );
}
