"use client";
import { useState, useEffect, useRef } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { checkoutSchemaWithFlags } from "../lib/checkout-schema";
import type { CheckoutPayload } from "@/types/checkout.types";
 
export type CheckoutFormValues = {
  firstName:   string;
  email:       string;
  phone:       string;
  address1:    string;
  city:        string;
  countryCode: string;
  // Optional in Zod schema — must be optional here too
  lastName?:   string;
  address2?:   string;
  province?:   string;
  zip?:        string;
};

export function useCheckoutForm(prefill: CheckoutPayload["customer"]) {
  const [provinceRequired, setProvinceRequired] = useState(false);
  const [zipRequired,      setZipRequired]      = useState(false);

  // Refs so the resolver closure always sees current values without
  // causing useForm to re-initialise (which would reset field values).
  const provinceRequiredRef = useRef(false);
  const zipRequiredRef      = useRef(false);

  useEffect(() => {
    provinceRequiredRef.current = provinceRequired;
    zipRequiredRef.current      = zipRequired;
  }, [provinceRequired, zipRequired]);

  // Cast needed because zodResolver's return type is inferred from the Zod
  // schema's output shape (which has optionals), while Resolver<T> expects T
  // exactly. The cast is safe — the runtime values are the same.
  const resolver = (async (data, context, options) =>
    zodResolver(
      checkoutSchemaWithFlags(
        provinceRequiredRef.current,
        zipRequiredRef.current,
      ),
    )(data, context, options)) as Resolver<CheckoutFormValues>;

  const methods = useForm<CheckoutFormValues>({
    resolver,
    defaultValues: {
      firstName:   prefill.name?.split(" ")[0]                 ?? "",
      lastName:    prefill.name?.split(" ").slice(1).join(" ") ?? "",
      email:       prefill.email   ?? "",
      phone:       prefill.phone   ?? "",
      address1:    prefill.address ?? "",
      address2:    "",
      city:        prefill.city    ?? "",
      countryCode: "AE",
      province:    "",
      zip:         "",
    },
    mode:           "onSubmit",  // only validate on submit attempt
    reValidateMode: "onChange",  // re-validate each field once the user fixes it
  });

  // Clear stale errors when country-driven required flags change
  useEffect(() => {
    methods.clearErrors();
  }, [provinceRequired, zipRequired]);

  function onRequiredChange(flags: {
    provinceRequired: boolean;
    zipRequired: boolean;
  }) {
    setProvinceRequired(flags.provinceRequired);
    setZipRequired(flags.zipRequired);
  }

  return { methods, provinceRequired, zipRequired, onRequiredChange };
}