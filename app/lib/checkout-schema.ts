import { z } from "zod";

export const checkoutSchema = z.object({
  // Contact
  firstName: z.string().min(1, "First name is required"),
  email: z.string().min(1, "Email is required").email("Enter a valid email"),

  // Address
  countryCode: z.string().min(1, "Country is required"),
  address1: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  phone: z.string().min(1, "Phone is required"),
  lastName: z.string().optional(),
  address2: z.string().optional(),
  province: z.string().optional(),
  zip: z.string().optional(),
});

// Dynamic refinement for province/zip based on country
export const checkoutSchemaWithFlags = (provinceRequired: boolean, zipRequired: boolean) =>
  checkoutSchema
    .refine((d) => !provinceRequired || !!d.province, {
      message: "This field is required",
      path: ["province"],
    })
    .refine((d) => !zipRequired || !!d.zip?.trim(), {
      message: "Postal code is required",
      path: ["zip"],
    });