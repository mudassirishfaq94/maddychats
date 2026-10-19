"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CircleDashed,
  Phone,
  Globe,
  MessagesSquare,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/app/chats", icon: MessagesSquare, label: "Chats", match: "/app" },
  { href: "/app/calls", icon: Phone, label: "Calls", match: "/app/calls" },
  { href: "/app/communities", icon: Globe, label: "Communities", match: "/app/communities" },
  { href: "/app/people", icon: Users, label: "People", match: "/app/people" },
  { href: "/app/status", icon: CircleDashed, label: "Status", match: "/app/status" },
  { href: "/app/settings", icon: Settings, label: "Settings", match: "/app/settings" },
] as const;

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile navigation"
      className="relative z-50 shrink-0 border-t border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <div className="flex items-center justify-between px-0 pt-1.5 pb-1">
        {NAV_ITEMS.map((item) => {
          const active =
            item.match === "/app"
              ? pathname === "/app" || pathname.startsWith("/app/chats")
              : pathname.startsWith(item.match);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 min-w-0 flex-1 rounded-lg px-0.5 py-1 text-center transition-colors",
                active
                  ? "text-[var(--accent-fg)]"
                  : "text-[var(--muted)] active:text-[var(--text)]",
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5",
                  active && "fill-current",
                )}
              />
              <span className="max-w-full truncate text-[0.58rem] font-medium leading-none">
                {item.label === "Communities" ? "Community" : item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}


