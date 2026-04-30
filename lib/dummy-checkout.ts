// lib/dummy-checkout.ts

import { CheckoutPayload } from "@/app/lib/checkout-token";

export const dummyPayload: CheckoutPayload = {
  currency: "USD",
  total: 14000, // cents (important based on your type)

  shop: "yourstore.myshopify.com",

  items: [
    {
      product_title: "Luxury Oud Perfume",
      price: 6000, 
      quantity: 2,
      image:
        "https://images.unsplash.com/photo-1594035910387-fea47794261f",
      variant_id: "variant_1",
      sku: "OUD-001",
    },
  ],

  customer: {
    id: "cust_1",
    name: "John Doe",
    email: "john@example.com",
    phone: "+1234567890",
    address: "123 Main Street",
    city: "Dubai",
    country: "UAE",
    addresses: [],
  },
};