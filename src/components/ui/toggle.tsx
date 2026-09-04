"use client";

import { cn } from "@/lib/utils";

/**
 * Reusable toggle switch component.
 * Proper iOS/Android-style toggle with smooth animation.
 */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
  size = "default",
  activeColor,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  size?: "small" | "default" | "large";
  activeColor?: string;
  className?: string;
}) {
  const sizes = {
    small: { track: "h-5 w-9", thumb: "h-3.5 w-3.5", translate: "translate-x-[18px]", translateOff: "translate-x-[3px]" },
    default: { track: "h-6 w-11", thumb: "h-4.5 w-4.5", translate: "translate-x-[22px]", translateOff: "translate-x-[3px]" },
    large: { track: "h-7 w-12", thumb: "h-5 w-5", translate: "translate-x-[24px]", translateOff: "translate-x-[3px]" },
  };

  const s = sizes[size];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        s.track,
        checked
          ? (activeColor || "bg-[var(--accent)]")
          : "bg-[var(--border-strong)]",
        className,
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out",
          s.thumb,
          checked ? s.translate : s.translateOff,
        )}
      />
    </button>
  );
}
