"use client";

import { useState } from "react";

const products = [
  {
    id: "dog-food",
    name: "Dog Food",
    price: 30,
    emoji: "🐶",
    category: "Pets",
    rating: 4.8,
    reviews: 124,
  },
  {
    id: "cat-food",
    name: "Cat Food",
    price: 30,
    emoji: "🐱",
    category: "Pets",
    rating: 4.7,
    reviews: 98,
  },
  {
    id: "perfume",
    name: "Perfume",
    price: 120,
    emoji: "🌸",
    category: "Beauty",
    rating: 4.9,
    reviews: 57,
  },
];

async function handleCheckout(packageId: string, name: string, email: string) {
  const res = await fetch("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name, packageId }),
  });
  const data = await res.json();
  if (data.url) window.location.href = data.url;
  return data;
}

type Product = (typeof products)[number];

// Fix: StarRating needs reviews passed in
function ProductStars({
  rating,
  reviews,
}: {
  rating: number;
  reviews: number;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-3 h-3 ${star <= Math.round(rating) ? "text-yellow-400" : "text-gray-200"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="text-xs text-gray-500 ml-1">
        {rating} ({reviews})
      </span>
    </div>
  );
}

export default function Page() {
  const [selected, setSelected] = useState<Product | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cartCount, setCartCount] = useState(0);

  function openModal(product: Product) {
    setSelected(product);
    setName("");
    setEmail("");
    setError("");
  }

  function closeModal() {
    setSelected(null);
    setError("");
  }

  async function onCheckout() {
    if (!selected) return;
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const data = await handleCheckout(selected.id, name.trim(), email.trim());
      if (data.error) setError(data.error);
    } catch {
      setError("Could not reach checkout. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* ── Announcement bar ── */}
      <div className="bg-gray-900 text-white text-xs text-center py-2 tracking-wide">
        Free shipping on orders over US$50 · Use code WELCOME10
      </div>

      {/* ── Navbar ── */}
      <header className="border-b border-gray-200 sticky top-0 bg-white z-40">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          {/* Logo */}
          <span className="text-lg font-bold tracking-tight">Shopify</span>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-6 text-sm text-gray-600">
            <a href="#" className="hover:text-black transition-colors">
              Home
            </a>
            <a
              href="#"
              className="hover:text-black transition-colors font-medium text-black border-b-2 border-black pb-0.5"
            >
              Shop
            </a>
            <a href="#" className="hover:text-black transition-colors">
              About
            </a>
            <a href="#" className="hover:text-black transition-colors">
              Contact
            </a>
          </nav>

          {/* Right icons */}
          <div className="flex items-center gap-4">
            {/* Search */}
            <button className="text-gray-500 hover:text-black transition-colors">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
                />
              </svg>
            </button>
            {/* Account */}
            <button className="text-gray-500 hover:text-black transition-colors">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"
                />
              </svg>
            </button>
            {/* Cart */}
            <button className="relative text-gray-500 hover:text-black transition-colors">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0"
                />
              </svg>
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-black text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-medium">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero banner ── */}
      <div className="bg-gray-50 border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-10 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">
              New arrivals
            </p>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">
              Shop All Products
            </h1>
            <p className="text-sm text-gray-500">
              Premium quality, delivered to your door
            </p>
          </div>
          <div className="text-5xl hidden md:block">🛍️</div>
        </div>
      </div>

      {/* ── Breadcrumb + filter bar ── */}
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          <span className="hover:text-black cursor-pointer">Home</span>
          <span className="mx-1">/</span>
          <span className="text-gray-700 font-medium">All products</span>
        </p>
        <p className="text-xs text-gray-400">{products.length} products</p>
      </div>

      {/* ── Product grid ── */}
      <div className="max-w-6xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product) => (
            <div
              key={product.id}
              className="group border border-gray-200 rounded-2xl overflow-hidden hover:shadow-md transition-shadow bg-white"
            >
              {/* Image area */}
              <div className="relative h-52 bg-gray-50 flex items-center justify-center text-7xl">
                {product.emoji}
                {/* Badge */}
                <span className="absolute top-3 left-3 bg-black text-white text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {product.category}
                </span>
                {/* Quick-add on hover */}
                <button
                  onClick={() => {
                    setCartCount((c) => c + 1);
                  }}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-gray-200 text-gray-800 text-xs font-medium px-4 py-1.5 rounded-full shadow-sm hover:bg-gray-50 whitespace-nowrap"
                >
                  + Quick add
                </button>
              </div>

              {/* Info */}
              <div className="p-4">
                <p className="text-[11px] text-gray-400 uppercase tracking-widest mb-1">
                  Dimondra
                </p>
                <p className="text-sm font-semibold text-gray-900 mb-1">
                  {product.name}
                </p>
                <ProductStars
                  rating={product.rating}
                  reviews={product.reviews}
                />
                <div className="flex items-center justify-between mt-3">
                  <span className="text-base font-bold text-gray-900">
                    US${product.price.toFixed(2)}
                  </span>
                  <button
                    onClick={() => openModal(product)}
                    className="bg-gray-900 text-white text-xs font-medium px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Buy now
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-sm font-bold text-gray-800">Dimondra</span>
          <p className="text-xs text-gray-400">
            © 2025 Dimondra. All rights reserved.
          </p>
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
              />
            </svg>
            Secured by Stripe
          </div>
        </div>
      </footer>

      {/* ── Checkout modal ── */}
      {selected && (
        <div
          onClick={closeModal}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-5"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl p-7 w-full max-w-sm shadow-xl"
          >
            <div className="flex justify-between items-start mb-5">
              <div>
                <p className="text-lg font-semibold mb-0.5">
                  {selected.emoji} {selected.name}
                </p>
                <p className="text-xs text-gray-500">
                  Enter your details to complete purchase
                </p>
              </div>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none bg-transparent border-none cursor-pointer"
              >
                ×
              </button>
            </div>

            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1">
                Full name
              </label>
              <input
                type="text"
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none box-border focus:border-gray-500"
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-1">Email</label>
              <input
                type="email"
                placeholder="jane@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none box-border focus:border-gray-500"
              />
            </div>

            <div className="flex justify-between py-3 border-t border-gray-100 mb-3">
              <span className="text-sm text-gray-500">Total</span>
              <span className="text-base font-bold">
                US${selected.price.toFixed(2)}
              </span>
            </div>

            {error && <p className="text-xs text-red-600 mb-2.5">{error}</p>}

            <button
              onClick={onCheckout}
              disabled={loading}
              className={`w-full py-2.5 text-white border-none rounded-lg text-sm font-semibold transition-colors ${loading ? "bg-gray-400 cursor-not-allowed" : "bg-gray-900 cursor-pointer hover:bg-gray-700"}`}
            >
              {loading ? "Redirecting to Stripe..." : "Proceed to payment →"}
            </button>

            <p className="text-xs text-gray-400 text-center mt-2.5">
              🔒 Secured by Stripe
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
