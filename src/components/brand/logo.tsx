import { cn } from "@/lib/utils";

/** Circular lock inspired by the supplied Circlo reference, kept vector sharp. */
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
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role="img"
      aria-label="Circlo"
    >
      <path d="M20 23V17a12 12 0 0 1 24 0v6" stroke="var(--brand-mark, currentColor)" strokeWidth="5.5" strokeLinecap="round" />
      <path d="M52 30a23 23 0 1 0 0 22" stroke="var(--brand-mark, currentColor)" strokeWidth="7" strokeLinecap="round" />
      <path d="M36 42a6 6 0 1 0-8 0l-1 9h10l-1-9Z" fill="var(--brand-key, currentColor)" />
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
            "font-display font-bold leading-none tracking-tight",
            textClassName,
          )}
          style={{ fontSize: size * 0.58 }}
        >
          circ<span className="text-[var(--accent-fg)]">lo</span>
        </span>

      </span>
    </span>
  );
}
