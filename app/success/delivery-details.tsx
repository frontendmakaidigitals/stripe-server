import { MapPin, CircleDollarSign, Truck } from "lucide-react";
import type { CustomerInfo } from "@/types/checkout.types";

interface Props {
  customer: {
    provider?: string;
    customer?: CustomerInfo;
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    country?: string;
    shipping?: number;
    shippingHandle?: string;
  } | null;
}

const PAYMENT_LABELS: Record<string, string> = {
  cod: "Cash on Delivery (COD)",
  stripe: "Credit / Debit Card",
  tabby: "Tabby — Pay in 4 installments",
  tamara: "Tamara — Buy Now Pay Later",
};

export default function DeliveryDetails({ customer: data }: Props) {
  const c = (data as any)?.customer ?? data;
  const provider = data?.provider ?? "cod";
  const handle = (data as any)?.shippingHandle;
  const shipping = (data as any)?.shipping;

  const name = c?.name || "—";
  const email = c?.email || "—";
  const phone = c?.phone || "—";
  const address = c?.address || "";
  const city = c?.city || "";
  const country = c?.country || "";

  const locationLine = [city, country].filter(Boolean).join(", ");

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-gray-200">
      <div className="flex w-full items-center justify-between p-5">
        <h2 className="text-xl font-semibold tracking-tight text-[#0f172a]">
          Delivery Details
        </h2>
      </div>

      {/* Shipping address */}
      <div className="p-5 flex items-start gap-3 border-t">
        <MapPin className="size-5 shrink-0 mt-0.5 text-gray-400" />
        <div>
          <p className="font-medium text-[#0f172a] mb-2">Shipping To</p>
          <div className="text-sm text-gray-500 space-y-0.5">
            <p>{name}</p>
            <p>{email}</p>
            <p>{phone}</p>
            {address && <p>{address}</p>}
            {locationLine && <p>{locationLine}</p>}
          </div>
        </div>
      </div>

      {/* Shipping method */}
      {(handle || shipping !== undefined) && (
        <div className="p-5 flex items-start gap-3 border-t">
          <Truck className="size-5 shrink-0 mt-0.5 text-gray-400" />
          <div>
            <p className="font-medium text-[#0f172a] mb-2">Shipping Method</p>
            <div className="text-sm text-gray-500 space-y-0.5">
              <p>{handle || "Standard Shipping"}</p>
              {shipping === 0 && <p className="text-green-600">Free</p>}
            </div>
          </div>
        </div>
      )}

      {/* Payment method */}
      <div className="p-5 flex items-start gap-3 border-t">
        <CircleDollarSign className="size-5 shrink-0 mt-0.5 text-gray-400" />
        <div>
          <p className="font-medium text-[#0f172a] mb-2">Payment Method</p>
          <div className="text-sm text-gray-500">
            <p>{PAYMENT_LABELS[provider] ?? provider}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
