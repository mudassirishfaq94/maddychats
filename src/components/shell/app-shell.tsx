"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { CircleDashed, Phone, MessagesSquare, Shield, Settings } from "lucide-react";
import type { SafeUser } from "@/lib/types";
import { LogoMark, LogoWordmark } from "@/components/brand/logo";
import { MobileNav } from "./mobile-nav";
import { cn } from "@/lib/utils";

// These components pull in search indexes, SSE/push wiring and theme state.
// Lazy-loading them keeps the initial JS bundle small so tab switches and the
// first paint do not pay for code the user has not asked for yet.
const ThemeToggle = dynamic(() => import("@/components/theme-toggle").then(module => module.ThemeToggle), { ssr: false });
const NotificationBell = dynamic(() => import("./notification-bell").then(module => module.NotificationBell), { ssr: false });
const MessageSearch = dynamic(() => import("@/components/chats/message-search").then(module => module.MessageSearch), { ssr: false });

/**
 * Authenticated shell: one compact header over a full-height content area.
 * Chat dominates — everything else lives in pages beneath it.
 */
export function AppShell({
  user,
  children,
}: {
  user: SafeUser;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    const update = () => setWide(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const onPeople = pathname.startsWith("/app/people") || pathname.startsWith("/app/users");
  const onStatus = pathname.startsWith("/app/status");
  const onSettings = pathname.startsWith("/app/settings") || pathname.startsWith("/app/profile") || pathname.startsWith("/app/help");
  const onChats = pathname === "/app" || ["/app/chats", "/app/people", "/app/users", "/app/communities", "/app/starred"].some(path=>pathname.startsWith(path));
  const onCalls = pathname.startsWith("/app/calls");
  const inChat = pathname.startsWith("/app/chats/");

  return (
    <div className="circlo-shell flex h-screen w-full min-w-0 flex-col overflow-hidden bg-[var(--bg)] pb-0 sm:pb-0">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <header className="z-40 flex h-14 w-full min-w-0 shrink-0 items-center gap-0.5 overflow-visible border-b border-[var(--border)] bg-[var(--surface)] px-2 sm:gap-1 sm:px-4">
        <Link href="/app/chats" aria-label="Circlo home" className="mr-0.5 shrink-0 sm:mr-3">
          <span className="flex items-center sm:hidden">
            <LogoWordmark size={25} />
          </span>
          <span className="hidden items-center sm:flex">
            <LogoWordmark size={26} />
          </span>
        </Link>

        <nav aria-label="Primary" className="hidden min-w-0 items-center gap-0 sm:flex sm:gap-0.5">
          <Link
            href="/app/chats"
            prefetch={false}
            aria-current={onChats ? "page" : undefined}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors sm:w-auto sm:gap-1.5 sm:px-3 sm:py-1.5",
              onChats
                ? "bg-[var(--surface-2)] text-[var(--text)]"
                : "text-[var(--muted)] hover:text-[var(--text)]",
            )}
          >
            <MessagesSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Chats</span>
          </Link>

          <Link
            href="/app/status"
            prefetch={false}
            aria-current={onStatus ? "page" : undefined}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors sm:w-auto sm:gap-1.5 sm:px-3 sm:py-1.5",
              onStatus
                ? "bg-[var(--surface-2)] text-[var(--text)]"
                : "text-[var(--muted)] hover:text-[var(--text)]",
            )}
          >
            <CircleDashed className="h-4 w-4" />
            <span className="hidden sm:inline">Status</span>
          </Link>
          <Link href="/app/calls" prefetch={false} aria-current={onCalls ? "page" : undefined} className={cn("flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors", onCalls ? "bg-[var(--surface-2)] text-[var(--text)]" : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]")}><Phone className="h-4 w-4"/><span className="hidden sm:inline">Calls</span></Link>
          <Link href="/app/settings" prefetch={false} aria-current={onSettings ? "page" : undefined} className={cn("flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium",onSettings ? "bg-[var(--surface-2)]" : "text-[var(--muted)]")}><Settings className="h-4 w-4"/>Settings</Link>
        </nav>

        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-0.5 sm:gap-1">
          {wide && !onPeople ? <span className="hidden md:inline-flex"><MessageSearch /></span> : null}
          {/* Hide extra icons on mobile when inside a chat (chat header has its own controls) */}
          <span className={cn("hidden sm:inline-flex", inChat && "md:inline-flex")}>
            {wide ? <NotificationBell /> : null}
          </span>
          {user.role === "admin" || user.role === "moderator" ? (
            <Link
              href="/app/admin"
              aria-label="Admin Panel"
              className={cn(
                "hidden h-9 w-9 items-center justify-center rounded-full transition-colors md:flex",
                pathname.startsWith("/app/admin")
                  ? "bg-[var(--accent-soft)] text-[var(--accent-fg)]"
                  : "text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--muted)_12%,transparent)] hover:text-[var(--text)]",
              )}
            >
              <Shield className="h-4 w-4" />
            </Link>
          ) : null}
          <ThemeToggle className="hidden min-[390px]:inline-flex" />
        </div>
      </header>

      <div id="recovery-status" className="shrink-0" />

      <main id="main-content" className="min-h-0 flex-1 overflow-hidden">
        {children}
      </main>

      <MobileNav />
    </div>
  );
}
