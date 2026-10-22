export function RouteLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-label={label} className="flex min-h-[40vh] items-center justify-center p-6">
      <span className="flex items-center gap-3 text-sm text-[var(--muted)]">
        <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />
        {label}
      </span>
    </div>
  );
}
