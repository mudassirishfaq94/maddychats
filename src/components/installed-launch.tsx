"use client";
import { LogoMark } from "@/components/brand/logo";
import { useHydrated } from "@/hooks/use-hydrated";

/** Rendered in the first HTML paint, removed immediately when the app hydrates. */
export function InstalledLaunch() {
  const ready = useHydrated();
  if (ready) return null;
  return <LaunchScreen />;
}

/** Public-only feedback while fresh session data is resolving on the server. */
export function LaunchScreen() {
  return <div className="installed-launch" role="status" aria-label="Opening Circlo">
    <div className="installed-launch-brand"><LogoMark size={88} /><span className="font-display">circlo</span></div>
    <p>Your circle. Your secrets. Sealed.</p>
    <span className="installed-launch-caption">Private conversations. Closer connections.</span>
  </div>;
}
