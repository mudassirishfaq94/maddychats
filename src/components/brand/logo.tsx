import { cn } from "@/lib/utils";

/** Linked circles from the approved monochrome Circlo reference. */
export function LogoMark({
  size = 30,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      className={className}
      role="img"
      aria-label="Circlo"
    >
      <g stroke="var(--brand-mark, currentColor)" strokeWidth="12" strokeLinecap="round">
        <path d="M53 15A25 25 0 1 0 46 54" />
        <path d="M46 40A25 25 0 1 1 43 78" />
      </g>
      <g fill="var(--brand-mark, currentColor)"><circle cx="32" cy="32" r="6.5" /><circle cx="64" cy="60" r="6.5" /></g>
    </svg>
  );
}

export function LogoWordmark({
  size = 30,
  className,
  textClassName,
}: {
  size?: number;
  className?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <span className="flex min-w-0 flex-col">
        <span
          className={cn(
            "font-display font-bold leading-none tracking-tight text-[var(--brand-mark)]",
            textClassName,
          )}
          style={{ fontSize: size * 0.58 }}
        >
          circlo
        </span>

      </span>
    </span>
  );
}
