type LogoProps = {
  className?: string;
  withWordmark?: boolean;
};

export function LogoMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient
          id="maddy-logo"
          x1="0"
          y1="0"
          x2="64"
          y2="64"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#598eff" />
          <stop offset="1" stopColor="#1836e1" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#maddy-logo)" />
      <path
        d="M16 24c0-3.3 2.7-6 6-6h20c3.3 0 6 2.7 6 6v12c0 3.3-2.7 6-6 6H28l-8 6v-6c-2.2 0-4-1.8-4-4V24z"
        fill="white"
      />
      <circle cx="27" cy="30" r="2.6" fill="#1836e1" />
      <circle cx="34" cy="30" r="2.6" fill="#1836e1" />
      <circle cx="41" cy="30" r="2.6" fill="#1836e1" />
    </svg>
  );
}

export function Logo({ className = "", withWordmark = true }: LogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <LogoMark className="h-10 w-10 shadow-glow rounded-2xl" />
      {withWordmark && (
        <div className="leading-tight">
          <div className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
            Maddy Chats
          </div>
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">
            Chat. Connect. Stay in sync.
          </div>
        </div>
      )}
    </div>
  );
}
