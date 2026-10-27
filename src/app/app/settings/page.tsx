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
  ChevronRight,
  Users, Globe, BookOpen, Star,
} from "lucide-react";
import { getSessionUser } from "@/server/session";
import { ThemeToggle } from "@/components/theme-toggle";
import { PrivacySettings } from "@/components/profile/privacy-settings";
import { NotificationPreferences } from "@/components/profile/notification-preferences";
import { TwoFactorAuth } from "@/components/profile/two-factor-auth";
import { LoginHistory } from "@/components/profile/login-history";
import { ProfileDisclosure } from "@/components/profile/profile-disclosure";
import { E2EEStatus } from "@/components/profile/e2ee-status";
import { AccountDataSection } from "@/components/profile/account-data";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/app/settings");



  return (
    <>
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

        <Link href="/app/profile" className="mt-6 flex min-h-16 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"><User className="h-5 w-5 shrink-0 text-[var(--accent-fg)]" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Your profile</span><span className="block text-xs text-[var(--muted)]">Photo, name and account details</span></span><ChevronRight className="h-4 w-4 shrink-0 text-[var(--muted)]" /></Link>
        <section aria-label="Explore Circlo" className="mt-4 grid gap-2 sm:grid-cols-2">
          {[
            {href:"/app/people",title:"People & contacts",description:"Find people, add contacts or scan a QR code",icon:Users},
            {href:"/app/communities",title:"Communities",description:"Your groups, communities and invitations",icon:Globe},
            {href:"/app/starred",title:"Starred messages",description:"Return to messages you saved",icon:Star},
            {href:"/help",title:"Circlo Help",description:"Ask the guide or explore suggested questions",icon:BookOpen},
          ].map(({href,title,description,icon:Icon})=><Link key={href} href={href} prefetch={false} className="flex min-h-20 items-center gap-3 rounded-2xl border border-[var(--border)] p-4 hover:bg-[var(--surface-2)]"><Icon className="h-5 w-5 shrink-0 text-[var(--accent-fg)]"/><span className="min-w-0"><span className="block text-sm font-semibold">{title}</span><span className="mt-1 block text-xs text-[var(--muted)]">{description}</span></span></Link>)}
        </section>

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
            <ProfileDisclosure title="Notification preferences" description="Choose which alerts you receive."><NotificationPreferences /></ProfileDisclosure>
          </section>

          {/* Privacy */}
          <section id="privacy">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <Shield className="h-4 w-4 text-[var(--accent)]" />
              Privacy & Safety
            </h2>
            <ProfileDisclosure title="Privacy preferences" description="Choose who can see and contact you."><PrivacySettings /></ProfileDisclosure>
          </section>

          {/* Security */}
          <section id="security">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <Lock className="h-4 w-4 text-[var(--accent)]" />
              Security
            </h2>
            <div className="space-y-4">
              <E2EEStatus />
              <div id="two-step-verification"><ProfileDisclosure title="Extra sign-in check" description="Ask for a code from your code app as well as your password." anchors={["two-step-verification"]}><TwoFactorAuth /></ProfileDisclosure></div>
              <ProfileDisclosure title="Recent sign-ins" description="Review recent account activity."><LoginHistory /></ProfileDisclosure>
            </div>
          </section>

          {/* Data */}
          <section id="data">
            <Link href="/app/profile#local-chat-backup" className="mb-4 flex min-h-16 items-center gap-3 rounded-2xl border border-[var(--border)] p-4"><Download className="h-5 w-5 shrink-0 text-[var(--accent-fg)]"/><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Chat backup & restore</span><span className="block text-xs text-[var(--muted)]">Daily protected copies on this device and recovery files you can carry</span></span><ChevronRight className="h-4 w-4 shrink-0"/></Link>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <Download className="h-4 w-4 text-[var(--accent)]" />
              Your Data
            </h2>
            <ProfileDisclosure title="Manage your data" description="Export your data or close your account."><AccountDataSection /></ProfileDisclosure>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-8 border-t border-[var(--border)] pt-4 pb-8">
          <div className="flex flex-wrap gap-4 text-xs text-[var(--muted)]">
            <Link href="/privacy" className="hover:text-[var(--text)]">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-[var(--text)]">Terms of Service</Link>
          </div>
          <p className="mt-2 text-[0.65rem] text-[var(--muted)] opacity-60">
            Circlo · Built with ❤️ by Mudassir Ishfaq
          </p>
        </div>
      </div>
    </>
  );
}
