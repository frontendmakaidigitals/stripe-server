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
  lastName?:   string;
  address2?:   string;
  province?:   string;
  zip?:        string;
};

export function useCheckoutForm(prefill: CheckoutPayload["customer"]) {
  const [provinceRequired, setProvinceRequired] = useState(false);
  const [zipRequired,      setZipRequired]      = useState(false);


  const [countryCode,      setCountryCode]      = useState("AE"); // ← add

  const provinceRequiredRef = useRef(false);
  const zipRequiredRef      = useRef(false);
  const countryCodeRef      = useRef("AE"); // ← add

  useEffect(() => {
    provinceRequiredRef.current = provinceRequired;
    zipRequiredRef.current      = zipRequired;
  }, [provinceRequired, zipRequired]);
 
  const resolver = (async (data, context, options) => {
    // Keep countryCode ref in sync from form data directly
    countryCodeRef.current = data.countryCode || "AE"; // ← add
    return zodResolver(
      checkoutSchemaWithFlags(
        provinceRequiredRef.current,
        zipRequiredRef.current,
        countryCodeRef.current,  
      ),
    )(data, context, options);
  }) as Resolver<CheckoutFormValues>;

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
    mode:           "onSubmit",
    reValidateMode: "onChange",
  });

  // Sync countryCode state when form field changes
  useEffect(() => {
    const sub = methods.watch((values) => {
      if (values.countryCode) {
        setCountryCode(values.countryCode);
        countryCodeRef.current = values.countryCode;
      }
    });
    return () => sub.unsubscribe();
  }, [methods]);

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