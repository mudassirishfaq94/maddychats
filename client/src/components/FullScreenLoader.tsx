import { LogoMark } from "./Logo";

export function FullScreenLoader() {
  return (
    <div className="flex h-full min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 dark:bg-slate-950">
      <LogoMark className="h-14 w-14 animate-float rounded-2xl shadow-glow" />
      <div className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
        Loading Maddy Chats…
      </div>
    </div>
  );
}
