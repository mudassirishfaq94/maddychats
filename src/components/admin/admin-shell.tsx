"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Users,
  MessageSquare,
  Activity,
  Flag,
  HardDrive,
  Lock,
  ChevronLeft,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/brand/logo";

const NAV_ITEMS = [
  { href: "/app/admin", label: "Overview", icon: BarChart3 },
  { href: "/app/admin/operations", label: "Control room", icon: Activity },
  { href: "/app/admin/users", label: "Users", icon: Users },
  { href: "/app/admin/messages", label: "Messages", icon: MessageSquare },
  { href: "/app/admin/activity", label: "Activity", icon: Activity },
  { href: "/app/admin/reports", label: "Reports", icon: Flag },
  { href: "/app/admin/storage", label: "Storage", icon: HardDrive },
  { href: "/app/admin/security", label: "Security", icon: Lock },
  { href: "/app/admin/audit", label: "Admin history", icon: Activity },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    if (!sidebarOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [sidebarOpen]);
  return (
    <div className="flex h-dvh min-h-0 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      {/* Sidebar */}
      <aside role="complementary" aria-label="Admin navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-transform lg:relative lg:z-auto lg:visible lg:translate-x-0",
          sidebarOpen ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-[var(--border)] px-4">
          <Link
            href="/app"
            aria-label="Back to Circlo"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)]"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <LogoMark size={24} />
          <span className="text-sm font-bold">Admin Panel</span>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close admin navigation"
            className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center lg:hidden"
          >
            <X className="h-4 w-4 text-[var(--muted)]" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/app/admin"
                ? pathname === "/app/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent-fg)]"
                    : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[var(--border)] p-3">
          <p className="text-[0.6rem] uppercase tracking-wider text-[var(--muted)]">
            Admin Dashboard v1.0
          </p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open admin navigation"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)]"
          >
            <Menu className="h-4 w-4" />
          </button>
          <span className="text-sm font-bold">Admin Panel</span>
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8">
          {children}
        </main>
      </div>
      <nav aria-label="Quick admin navigation" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV_ITEMS.filter(item => ["Overview", "Users", "Reports"].includes(item.label)).map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} className={cn("flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px]", pathname === item.href ? "font-semibold text-[var(--accent-fg)]" : "text-[var(--muted)]")}><item.icon className="h-5 w-5" />{item.label}</Link>)}
        <button type="button" aria-label="More admin tools" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)} className="flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] text-[var(--muted)]"><Menu className="h-5 w-5" />More</button>
      </nav>
    </div>
  );
}
