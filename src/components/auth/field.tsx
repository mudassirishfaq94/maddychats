"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  icon?: ReactNode;
  trailing?: ReactNode;
}

/** Labeled input with icon, trailing adornment, error + hint messaging. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, hint, icon, trailing, className, id, ...inputProps },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div>
      <label htmlFor={inputId} className="field-label">
        {label}
      </label>
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]">
            {icon}
          </span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "field-input",
            icon ? "field-input--icon" : null,
            trailing ? "field-input--trailing" : null,
            className,
          )}
          data-invalid={Boolean(error)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...inputProps}
        />
        {trailing ? (
          <span className="absolute right-2 top-1/2 -translate-y-1/2">
            {trailing}
          </span>
        ) : null}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="field-error" role="alert">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
});
