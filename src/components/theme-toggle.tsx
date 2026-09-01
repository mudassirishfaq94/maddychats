"use client";

import { useEffect, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

function applyTheme(theme: Theme) {
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  const light =
    theme === "light" || (theme === "system" && mq.matches);
  document.documentElement.classList.toggle("light", light);
}

/**
 * Light / Dark / System theme picker. The choice persists in localStorage and
 * System mode tracks OS appearance live. Pre-paint application happens in the
 * root layout's inline script, so there is never a flash of the wrong theme.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem("maddy-theme") as Theme) || "system";
    const timer = window.setTimeout(() => setTheme(stored), 0);
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = (e: MediaQueryListEvent) => {
      const current = (localStorage.getItem("maddy-theme") as Theme) || "system";
      if (current === "system") applyTheme(e.matches ? "light" : "dark");
    };
    mq.addEventListener("change", onChange);
    return () => {
      window.clearTimeout(timer);
      mq.removeEventListener("change", onChange);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const ActiveIcon =
    theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  function pick(next: Theme) {
    setTheme(next);
    try {
      localStorage.setItem("maddy-theme", next);
    } catch {
      // private mode — theme applies for this session only
    }
    applyTheme(next);
    setOpen(false);
  }

  return (
    <span className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Change theme"
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition-all duration-200 hover:text-[var(--text)] hover:border-[var(--border-strong)] hover:bg-[color-mix(in_srgb,var(--muted)_10%,transparent)]"
      >
        {theme === null ? (
          <span className="h-4 w-4" />
        ) : (
          <ActiveIcon className="h-4 w-4" />
        )}
      </button>

      {open ? (
        <span
          role="menu"
          aria-label="Theme"
          className="card-glass absolute right-0 top-[calc(100%+10px)] z-50 w-40 rounded-2xl p-1.5 animate-fade-up"
        >
          {OPTIONS.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={theme === value}
              onClick={() => pick(value)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                theme === value
                  ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]"
                  : "text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--muted)_10%,transparent)] hover:text-[var(--text)]",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
              {theme === value ? (
                <Check className="ml-auto h-3.5 w-3.5" />
              ) : null}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}
