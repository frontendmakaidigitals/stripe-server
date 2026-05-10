import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import type { CartItem } from "@/types/checkout.types";

interface Props {
  items?: CartItem[];
  currency?: string;
  shipping?: number;
  codFee?: number;
  discountAmount?: number;
  discountCode?: string;
  isUAE?: boolean;
}

const VAT_RATE = 0.05;

export default function OrderSummary({
  items = [],
  currency = "AED",
  shipping = 0,
  codFee = 0,
  discountAmount = 0,
  discountCode,
  isUAE = true,
}: Props) {
  const [itemsOpen, setItemsOpen] = useState(true);

  // All prices stored VAT-inclusive (taxes_included: true)
  // Back-calculate excl. VAT for display
  const divisor = isUAE ? 1 + VAT_RATE : 1;

  const subtotalInclVAT = items.reduce(
    (sum, i) => sum + i.price * i.quantity,
    0,
  );
  const shippingInclVAT = shipping;
  const codFeeInclVAT = codFee;
  const discountInclVAT = discountAmount;

  const subtotalExcl = subtotalInclVAT / divisor;
  const shippingExcl = shippingInclVAT / divisor;
  const codFeeExcl = codFeeInclVAT / divisor;
  const discountExcl = discountInclVAT / divisor;

  const totalExcl = subtotalExcl + shippingExcl + codFeeExcl - discountExcl;
  const vat = isUAE ? totalExcl * VAT_RATE : 0;
  const total = totalExcl + vat;

  const fmt = (n: number) =>
    `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-gray-200">
      {/* Header */}
      <button
        onClick={() => setItemsOpen(!itemsOpen)}
        className="flex w-full items-center justify-between p-5"
      >
        <h2 className="text-xl font-semibold tracking-tight text-[#0f172a]">
          Order Summary
        </h2>
        {itemsOpen ? (
          <ChevronUp className="size-5 text-gray-500" />
        ) : (
          <ChevronDown className="size-5 text-gray-500" />
        )}
      </button>

      <div className="border-t border-gray-200">
        {/* Collapsible items */}
        <div
          className={`grid transition-all duration-300 ${
            itemsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            <div className="space-y-3 p-5">
              {items.length === 0 && (
                <p className="text-sm text-gray-400">No items found.</p>
              )}
              {items.map((item, index) => (
                <div
                  key={item.variant_id ?? index}
                  className={`flex items-start justify-between gap-6 ${
                    items.length - 1 === index ? "" : "border-b pb-3"
                  }`}
                >
                  <div className="flex gap-4">
                    {item.image && (
                      <div className="relative shrink-0">
                        <img
                          src={item.image}
                          alt={item.product_title}
                          className="size-16 rounded-2xl object-cover"
                        />
                        <span className="absolute -top-2 -right-2 size-5 rounded-full bg-gray-800 text-white text-xs flex items-center justify-center">
                          {item.quantity}
                        </span>
                      </div>
                    )}
                    <div>
                      <h3 className="font-medium text-[#0f172a]">
                        {item.product_title}
                      </h3>
                      {item.sku && (
                        <p className="mt-1 text-sm text-gray-500">
                          SKU: {item.sku}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-[#0f172a] shrink-0">
                    {fmt(item.price * item.quantity)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Totals */}
        <div className="border-t border-gray-200 p-5 space-y-3">
          {discountAmount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-gray-600">
                Discount {discountCode ? `(${discountCode})` : ""}
              </span>
              <span className="font-medium text-green-600">
                − {fmt(discountExcl)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-gray-600">
              Subtotal {isUAE ? "(excl. VAT)" : ""}
            </span>
            <span className="font-semibold text-[#0f172a]">
              {fmt(subtotalExcl)}
            </span>
          </div>

          {codFee > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-amber-600">
                COD fee {isUAE ? "(excl. VAT)" : ""}
              </span>
              <span className="font-medium text-amber-600">
                + {fmt(codFeeExcl)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-gray-600">
              Shipping {isUAE ? "(excl. VAT)" : ""}
            </span>
            {shipping === 0 ? (
              <span className="font-medium text-green-600">Free</span>
            ) : (
              <span className="font-medium text-[#0f172a]">
                {fmt(shippingExcl)}
              </span>
            )}
          </div>

          {isUAE && (
            <div className="flex items-center justify-between">
              <span className="text-gray-600">VAT ( @ 5% )</span>
              <span className="font-medium text-[#0f172a]">{fmt(vat)}</span>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-gray-200 pt-4 mt-1">
            <span className="text-xl font-bold text-[#0f172a]">Total</span>
            <span className="text-2xl font-bold text-[#0f172a]">
              {fmt(total)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
