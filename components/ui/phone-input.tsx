"use client";
import * as React from "react";
import * as RPNInput from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import { cn } from "@/lib/utils";

type PhoneInputProps = {
  value?: string;
  onChange?: (value: string) => void;
  lockedCountry?: RPNInput.Country;
  placeholder?: string;
  error?: boolean;
  className?: string;
};

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, lockedCountry, placeholder, error, className }, ref) => {
    const dialCode = lockedCountry
      ? `+${RPNInput.getCountryCallingCode(lockedCountry)}`
      : "";

    const Flag = lockedCountry ? flags[lockedCountry] : null;

    // Strip dial code prefix to get the local number part for display
    const localNumber = value?.startsWith(dialCode)
      ? value.slice(dialCode.length).trimStart()
      : (value ?? "");

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const raw = e.target.value.replace(/[^\d\s\-().]/g, ""); // digits + formatting only
      const full = dialCode ? `${dialCode}${raw}` : raw;
      onChange?.(full);
    }

    return (
      <div
        className={cn(
          "flex h-12 w-full rounded-md border border-gray-300 bg-white overflow-hidden",
          error && "border-red-400 bg-red-50",
          className,
        )}
      >
        {/* Flag + dial code — not clickable */}
        <div className="flex items-center gap-1.5 px-3 border-r border-gray-300 bg-gray-50 shrink-0 select-none">
          {Flag ? (
            <span className="flex h-5 w-7 overflow-hidden rounded-sm bg-foreground/20 [&_svg]:size-full">
              <Flag title={lockedCountry || ""} />
            </span>
          ) : (
            <span className="h-4 w-6 rounded-sm bg-gray-200" />
          )}
          {dialCode && (
            <span className="text-sm text-gray-600 font-medium">
              {dialCode}
            </span>
          )}
        </div>

        {/* Number input */}
        <input
          ref={ref}
          type="tel"
          value={localNumber}
          onChange={handleChange}
          placeholder={placeholder ?? "Phone number"}
          className={cn(
            "flex-1 px-3 text-sm outline-none bg-transparent",
            error && "bg-red-50",
          )}
        />
      </div>
    );
  },
);

PhoneInput.displayName = "PhoneInput";

export { PhoneInput };
