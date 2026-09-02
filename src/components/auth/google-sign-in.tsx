export function GoogleSignIn({ next = "/app" }: { next?: string }) {
  const target = next.startsWith("/") ? next : "/app";
  return (
    <>
      <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-[var(--border)]" /><span className="text-xs text-[var(--muted)]">or</span><span className="h-px flex-1 bg-[var(--border)]" /></div>
      <a href={`/api/auth/google?next=${encodeURIComponent(target)}`} className="btn btn-secondary w-full"><span aria-hidden="true" className="text-base font-bold">G</span>Continue with Google</a>
    </>
  );
}
