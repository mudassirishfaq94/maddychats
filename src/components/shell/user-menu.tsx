"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, Star, UserRound } from "lucide-react";
import type { SafeUser } from "@/lib/types";
import { useAuth } from "@/components/providers/auth-provider";
import { Avatar } from "@/components/avatar";
import { cn } from "@/lib/utils";

export function UserMenu({ user }: { user: SafeUser }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { signOut } = useAuth();

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.push("/login");
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-[var(--border)] py-1 pl-1 pr-2.5 transition-all duration-200 hover:border-[var(--border-strong)] hover:bg-[color-mix(in_srgb,var(--muted)_8%,transparent)]"
      >
        <Avatar user={user} size={30} />
        <span className="hidden max-w-28 truncate text-sm font-semibold sm:block">
          {user.displayName.split(" ")[0]}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-[var(--muted)] transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="card-glass absolute right-0 top-[calc(100%+10px)] w-64 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl p-1.5 animate-fade-up"
        >
          <div className="flex items-center gap-3 rounded-xl px-3 py-3">
            <Avatar user={user} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.displayName}</p>
              <p className="truncate text-xs text-[var(--muted)]">@{user.username}</p>
            </div>
            <span className="pulse-dot ml-auto h-2 w-2 shrink-0 rounded-full bg-[var(--success)]" />
          </div>
          <div className="my-1 border-t border-[var(--border)]" />
          <Link
            href="/app/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-[var(--muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--muted)_10%,transparent)] hover:text-[var(--text)]"
          >
            <UserRound className="h-4 w-4" />
            Profile
          </Link>
          <Link
            href="/app/starred"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-[var(--muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--muted)_10%,transparent)] hover:text-[var(--text)]"
          >
            <Star className="h-4 w-4" />
            Starred messages
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
