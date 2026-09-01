import { cn } from "@/lib/utils";

/**
 * Maddy Chats brand mark — a monochrome chat bubble with a single accent
 * pulse line. Clean, ownable, free of gradients.
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
      aria-label="Maddy Chats"
    >
      <path
        d="M20 3.5C10.9 3.5 3.5 10 3.5 18c0 4.6 2.3 8.7 6 11.4-.2 2.3-1.4 4.9-3.2 6.6-.3.3 0 .9.5.8 4.7-.6 8.2-2.1 10.4-3.4.9.1 1.9.1 2.8.1 9.1 0 16.5-6.5 16.5-14.5S29.1 3.5 20 3.5Z"
        fill="currentColor"
      />
      <path
        d="M10.5 19.5h4l2.2-4.5 3.2 8 2.4-5 1.4 1.5h5.8"
        stroke="var(--accent)"
        strokeWidth="2.4"
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
}: {
  size?: number;
  className?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <span
        className={cn(
          "font-display font-bold leading-none tracking-tight",
          textClassName,
        )}
        style={{ fontSize: size * 0.58 }}
      >
        Maddy <span className="text-[var(--muted)] font-semibold">Chats</span>
      </span>
    </span>
  );
}
