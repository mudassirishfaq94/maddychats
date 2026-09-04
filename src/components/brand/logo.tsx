import { cn } from "@/lib/utils";

/**
 * ZipTalk brand mark — a fast "Z" conversation trail inside a chat bubble.
 */
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
      aria-label="ZipTalk"
    >
      <path
        d="M7 4.5h26a4.5 4.5 0 0 1 4.5 4.5v19A4.5 4.5 0 0 1 33 32.5H19l-9.5 5v-5H7A4.5 4.5 0 0 1 2.5 28V9A4.5 4.5 0 0 1 7 4.5Z"
        fill="currentColor"
      />
      <path
        d="M11 12h18L12 25h17"
        stroke="var(--accent)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
          Zip<span className="text-[var(--accent-fg)]">Talk</span>
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
