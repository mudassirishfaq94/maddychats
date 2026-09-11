import { cn } from "@/lib/utils";

/** Circlo brand mark — overlapping conversation circles. */
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
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      role="img"
      aria-label="Circlo"
    >
      <path
        d="M20 3.5a16.5 16.5 0 1 0 0 33 16.5 16.5 0 0 0 0-33Z"
        fill="currentColor"
      />
      <path
        d="M14.3 14.1a6.4 6.4 0 0 1 10.8 2.2 6.4 6.4 0 1 1-1.4 12.6l-3.7 3.1v-3.1a6.4 6.4 0 0 1-5.7-6.3Z"
        stroke="var(--action-fg)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="25.8" cy="13.3" r="3.2" fill="var(--accent)" />
    </svg>
  );
}

export function LogoWordmark({
  size = 30,
  className,
  textClassName,
  byline = false,
}: {
  size?: number;
  className?: string;
  textClassName?: string;
  byline?: boolean;
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
          Circ<span className="text-[var(--accent-fg)]">lo</span>
        </span>
        {byline ? (
          <span className="mt-0.5 whitespace-nowrap text-[0.5rem] leading-none text-[var(--muted)]">
            App by Mudassir Ishfaq
          </span>
        ) : null}
      </span>
    </span>
  );
}
