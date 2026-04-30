// checkout.types.ts
export type PaymentMethod = "stripe" | "cod" | null;
export type Step = "contact" | "shipping" | "payment" | "cod-success";

export type ShippingRate = {
  handle: string;
  title: string;
  estimatedDays?: string | null;
  price: { amount: string; currencyCode: string };
};

export type DiscountResult = {
  valid: boolean;
  amount: number;
  type: "percentage" | "fixed" | null;
  code: string;
} | null;

export type NewAddrForm = {
  firstName: string;
  lastName: string;
  address1: string;
  address2?: string;    
  city: string;
  countryCode: string;
  province?: string;    
  zip: string;
  phone: string;
  provinceName?: string;
};
export type CustomerInfo = {
  id: string;              
  name: string;
  email: string;
  phone: string;
  address: string;
  address2?: string;
  city: string;
  country: string;
  countryCode: string;       
   province?: string;      // code e.g. "DU"
  provinceName?: string;  // name e.g. "Dubai"  ← add       
  zip?: string;              
  addresses: ShopifyAddress[];
};

export interface CartItem {
  product_title: string;
  quantity: number;
  price: number;      
  image?: string;
  variant_id?: string;
  sku?: string;
}
export interface ShopifyAddress {
  id: string;
  name: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  country: string;
  is_default: boolean;
}
export interface checkoutItem {
  product_title: string;
  quantity: number;
  price: number;
  image?: string;
  variant_id?: string;
  sku?: string;
}
    
 

export interface CheckoutPayload {
  items: CartItem[];
  currency: string;
  total: number;       // in cents
  customer: CustomerInfo;
  shop: string;     
  token?:string   // e.g. "yourstore.myshopify.com"
}
