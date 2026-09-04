import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  Shield,
  Palette,
  User,
  Lock,
  Download,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { getSessionUser } from "@/server/session";
import { AppShell } from "@/components/shell/app-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { PrivacySettings } from "@/components/profile/privacy-settings";
import { NotificationPreferences } from "@/components/profile/notification-preferences";
import { TwoFactorAuth } from "@/components/profile/two-factor-auth";
import { LoginHistory } from "@/components/profile/login-history";
import { E2EEStatus } from "@/components/profile/e2ee-status";
import { AccountDataSection } from "@/components/profile/account-data";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/app/settings");

  const sections = [
    {
      icon: User,
      label: "Profile",
      description: "Edit your display name, username, bio, and photo",
      href: "/app/profile",
    },
    {
      icon: Palette,
      label: "Appearance",
      description: "Theme, dark mode, and visual preferences",
      id: "appearance",
    },
    {
      icon: Bell,
      label: "Notifications",
      description: "Control push, email, and in-app notifications",
      id: "notifications",
    },
    {
      icon: Shield,
      label: "Privacy & Safety",
      description: "Profile visibility, who can message you, and more",
      id: "privacy",
    },
    {
      icon: Lock,
      label: "Security",
      description: "Two-factor authentication and login history",
      id: "security",
    },
    {
      icon: Download,
      label: "Your Data",
      description: "Download your data or delete your account",
      id: "data",
    },
  ];

  return (
    <AppShell user={user}>
      <div className="mx-auto h-full w-full min-w-0 max-w-3xl overflow-y-auto overflow-x-hidden px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/app"
            className="flex h-10 min-w-[44px] items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--muted)_12%,transparent)] hover:text-[var(--text)]"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="font-display text-xl font-bold">Settings</h1>
            <p className="text-xs text-[var(--muted)]">
              Manage your account, privacy, and preferences
            </p>
          </div>
        </div>

        {/* Quick links */}
        <div className="mt-6 space-y-2">
          {sections.map((section) => {
            const Icon = section.icon;
            if (section.href) {
              return (
                <Link
                  key={section.label}
                  href={section.href}
                  className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
                    <Icon className="h-5 w-5 text-[var(--accent-fg)]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{section.label}</span>
                    <span className="block text-xs text-[var(--muted)]">{section.description}</span>
                  </span>
                  <ExternalLink className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                </Link>
              );
            }
            return null;
          })}
        </div>

        {/* Inline sections */}
        <div className="mt-8 space-y-6">
          {/* Appearance */}
          <section id="appearance">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <Palette className="h-4 w-4 text-[var(--accent)]" />
              Appearance
            </h2>
            <div className="card-glass rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Dark mode</p>
                  <p className="text-xs text-[var(--muted)]">Switch between light and dark themes</p>
                </div>
                <ThemeToggle />
              </div>
            </div>
          </section>

          {/* Notifications */}
          <section id="notifications">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <Bell className="h-4 w-4 text-[var(--accent)]" />
              Notifications
            </h2>
            <NotificationPreferences />
          </section>

          {/* Privacy */}
          <section id="privacy">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <Shield className="h-4 w-4 text-[var(--accent)]" />
              Privacy & Safety
            </h2>
            <PrivacySettings />
          </section>

          {/* Security */}
          <section id="security">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <Lock className="h-4 w-4 text-[var(--accent)]" />
              Security
            </h2>
            <div className="space-y-4">
              <E2EEStatus userId={user.id} />
              <TwoFactorAuth />
              <LoginHistory />
            </div>
          </section>

          {/* Data */}
          <section id="data">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <Download className="h-4 w-4 text-[var(--accent)]" />
              Your Data
            </h2>
            <AccountDataSection />
          </section>
        </div>

        {/* Footer */}
        <div className="mt-8 border-t border-[var(--border)] pt-4 pb-8">
          <div className="flex flex-wrap gap-4 text-xs text-[var(--muted)]">
            <Link href="/privacy" className="hover:text-[var(--text)]">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-[var(--text)]">Terms of Service</Link>
          </div>
          <p className="mt-2 text-[0.65rem] text-[var(--muted)] opacity-60">
            Maddy Chats · Built with ❤️ by Mudassir Ishfaq
          </p>
        </div>
      </div>
    </AppShell>
  );
}
