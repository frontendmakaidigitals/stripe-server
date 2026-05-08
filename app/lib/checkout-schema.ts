import { z } from "zod";
import { isValidPhoneNumber, parsePhoneNumber } from "libphonenumber-js";

export const checkoutSchema = z.object({
  // Contact
  firstName:   z.string().min(1, "First name is required"),
  email:       z.string().min(1, "Email is required").email("Enter a valid email"),

  // Address
  countryCode: z.string().min(1, "Country is required"),
  address1:    z.string().min(1, "Address is required"),
  city:        z.string().min(1, "City is required"),
  phone: z.string().min(1, "Phone is required"),

  lastName:    z.string().optional(),
  address2:    z.string().optional(),
  province:    z.string().optional(),
  zip:         z.string().optional(),
});

export const checkoutSchemaWithFlags = (
  provinceRequired: boolean,
  zipRequired: boolean,
  countryCode: string = "AE", // ← add
) =>
  checkoutSchema
    .refine((d) => !provinceRequired || !!d.province, {
      message: "This field is required",
      path: ["province"],
    })
    .refine((d) => !zipRequired || !!d.zip?.trim(), {
      message: "Postal code is required",
      path: ["zip"],
    })
    // Validate phone is a valid number
    .refine(
      (d) => {
        if (!d.phone) return false;
        try {
          return isValidPhoneNumber(d.phone);
        } catch {
          return false;
        }
      },
      {
        message: "Invalid phone number",
        path: ["phone"],
      },
    )
    // Validate phone country matches selected country
    .superRefine((d, ctx) => {
      if (!d.phone || !countryCode) return;
      try {
        const parsed = parsePhoneNumber(d.phone);
        if (parsed?.country && parsed.country !== countryCode) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Phone country doesn't match selected country`,
            path: ["phone"],
          });
        }
      } catch {
        // already caught by isValidPhoneNumber refine above
      }
    });