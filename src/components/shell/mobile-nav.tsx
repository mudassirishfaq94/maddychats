"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CircleDashed,
  Globe,
  MessagesSquare,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/app", icon: MessagesSquare, label: "Chats", match: "/app" },
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
      className="fixed bottom-0 inset-x-0 z-50 border-t border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <div className="flex items-center justify-around px-1 pt-1.5 pb-1">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/app"
              ? pathname === "/app" || pathname.startsWith("/app/chats")
              : pathname.startsWith(item.match);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 text-center transition-colors",
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
              <span className="text-[0.62rem] font-medium leading-none">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}


