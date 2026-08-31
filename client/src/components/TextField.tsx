import { forwardRef, useId, type InputHTMLAttributes } from "react";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, error, hint, id, className = "", ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <div>
        <label htmlFor={fieldId} className="field-label">
          {label}
        </label>
        <input
          ref={ref}
          id={fieldId}
          className={`input-field ${
            error ? "border-rose-400 focus:border-rose-400 focus:ring-rose-500/15" : ""
          } ${className}`}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          {...props}
        />
        {error ? (
          <p id={`${fieldId}-error`} className="field-error">
            {error}
          </p>
        ) : hint ? (
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">{hint}</p>
        ) : null}
      </div>
    );
  }
);

TextField.displayName = "TextField";
