"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleDashed, MessagesSquare, Shield, Users } from "lucide-react";
import type { SafeUser } from "@/lib/types";
import { LogoMark, LogoWordmark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "./notification-bell";
import { MobileNav } from "./mobile-nav";
import { MessageSearch } from "@/components/chats/message-search";
import { UserMenu } from "./user-menu";
import { cn } from "@/lib/utils";

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
  const onPeople = pathname.startsWith("/app/people") || pathname.startsWith("/app/users");
  const onStatus = pathname.startsWith("/app/status");
  const onChats = !onPeople && !onStatus && !pathname.startsWith("/app/profile") && !pathname.startsWith("/app/starred");
  const inChat = pathname.startsWith("/app/chats/");

  return (
    <div className="flex h-dvh w-full min-w-0 flex-col overflow-hidden bg-[var(--bg)] pb-0 sm:pb-0">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <header className="z-40 flex h-14 w-full min-w-0 shrink-0 items-center gap-0.5 overflow-visible border-b border-[var(--border)] bg-[var(--surface)] px-2 sm:gap-1 sm:px-4">
        <Link href="/app" aria-label="ZipTalk home" className="mr-0.5 shrink-0 sm:mr-3">
          <span className="flex items-center sm:hidden">
            <LogoWordmark size={25} byline />
          </span>
          <span className="hidden items-center sm:flex">
            <LogoWordmark size={26} byline />
          </span>
        </Link>

        <nav aria-label="Primary" className="hidden min-w-0 items-center gap-0 sm:flex sm:gap-0.5">
          <Link
            href="/app"
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
            href="/app/people"
            aria-current={onPeople ? "page" : undefined}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors sm:w-auto sm:gap-1.5 sm:px-3 sm:py-1.5",
              onPeople ? "bg-[var(--surface-2)] text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)]",
            )}
          >
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">People</span>
          </Link>
          <Link
            href="/app/status"
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
        </nav>

        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-0.5 sm:gap-1">
          <span className="hidden md:inline-flex"><MessageSearch /></span>
          {/* Hide extra icons on mobile when inside a chat (chat header has its own controls) */}
          <span className={cn("hidden sm:inline-flex", inChat && "md:inline-flex")}>
            <NotificationBell />
          </span>
          {user.email === "mudassarmalak090@gmail.com" ? (
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
          <UserMenu user={user} />
        </div>
      </header>

      <main id="main-content" className="min-h-0 flex-1 overflow-hidden pb-[calc(56px+env(safe-area-inset-bottom))] sm:pb-0">
        {children}
      </main>

      <MobileNav />
    </div>
  );
}
