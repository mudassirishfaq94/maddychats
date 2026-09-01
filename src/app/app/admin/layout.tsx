"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Users,
  MessageSquare,
  Shield,
  Activity,
  ChevronLeft,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/app/admin", label: "Overview", icon: BarChart3 },
  { href: "/app/admin/users", label: "Users", icon: Users },
  { href: "/app/admin/messages", label: "Messages", icon: MessageSquare },
  { href: "/app/admin/activity", label: "Activity", icon: Activity },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => {
        if (!r.ok) setAccessDenied(true);
      })
      .catch(() => setAccessDenied(true))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-[var(--muted)]">Checking admin access…</div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <Shield className="mb-4 h-12 w-12 text-[var(--danger)]" />
        <h1 className="text-xl font-bold">Access Denied</h1>
        <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">
          You don&apos;t have admin access. Only the workspace owner can view this page.
        </p>
        <Link
          href="/app"
          className="btn btn-primary mt-6 px-4 py-2 text-sm"
        >
          Back to Chats
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Mobile overlay */}
      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-transform lg:relative lg:z-auto lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-[var(--border)] px-4">
          <Link
            href="/app"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)]"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <Shield className="h-4 w-4 text-[var(--accent)]" />
          <span className="text-sm font-bold">Admin Panel</span>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="ml-auto lg:hidden"
          >
            <X className="h-4 w-4 text-[var(--muted)]" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-2">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/app/admin"
                ? pathname === "/app/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
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
        <header className="flex h-14 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)]"
          >
            <Menu className="h-4 w-4" />
          </button>
          <span className="text-sm font-bold">Admin Panel</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
