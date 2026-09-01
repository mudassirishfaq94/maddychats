"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleDashed, MessagesSquare, Star, Users } from "lucide-react";
import type { SafeUser } from "@/lib/types";
import { LogoWordmark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "./notification-bell";
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
  const onStarred = pathname.startsWith("/app/starred");
  const onStatus = pathname.startsWith("/app/status");
  const onChats = !onPeople && !onStarred && !onStatus && !pathname.startsWith("/app/profile");

  return (
    <div className="flex h-dvh flex-col bg-[var(--bg)]">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <header className="z-40 flex h-14 shrink-0 items-center gap-1 border-b border-[var(--border)] bg-[var(--surface)] px-3 sm:px-4">
        <Link href="/app" aria-label="Maddy Chats home" className="mr-1 sm:mr-3">
          <LogoWordmark size={26} />
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-0.5">
          <Link
            href="/app"
            aria-current={onChats ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              onChats
                ? "bg-[var(--surface-2)] text-[var(--text)]"
                : "text-[var(--muted)] hover:text-[var(--text)]",
            )}
          >
            <MessagesSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Chats</span>
          </Link>
          <Link
            href="/app/starred"
            aria-current={onStarred ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              onStarred
                ? "bg-[var(--surface-2)] text-[var(--text)]"
                : "text-[var(--muted)] hover:text-[var(--text)]",
            )}
          >
            <Star className="h-4 w-4" />
            <span className="hidden sm:inline">Starred</span>
          </Link>
          <Link
            href="/app/status"
            aria-current={onStatus ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              onStatus ? "bg-[var(--surface-2)] text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)]",
            )}
          >
            <CircleDashed className="h-4 w-4" />
            <span className="hidden sm:inline">Status</span>
          </Link>
          <Link
            href="/app/people"
            aria-current={onPeople ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              onPeople
                ? "bg-[var(--surface-2)] text-[var(--text)]"
                : "text-[var(--muted)] hover:text-[var(--text)]",
            )}
          >
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">People</span>
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <MessageSearch />
          <NotificationBell />
          <ThemeToggle />
          <UserMenu user={user} />
        </div>
      </header>

      <main id="main-content" className="min-h-0 flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
