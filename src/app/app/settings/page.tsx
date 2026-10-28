import {redirect} from "next/navigation";
import Link from "next/link";
import {getSessionUser} from "@/server/session";
import {NotificationPreferences} from "@/components/profile/notification-preferences";
import {PrivacySettings} from "@/components/profile/privacy-settings";
import {TwoFactorAuth} from "@/components/profile/two-factor-auth";
import {LoginHistory} from "@/components/profile/login-history";
import {AccountDataSection} from "@/components/profile/account-data";
import {EncryptionDevices} from "@/components/profile/encryption-devices";
import {LocalChatBackupSettings} from "@/components/profile/local-chat-backup";
import {CloudRecoverySettings} from "@/components/profile/cloud-recovery";
import {DeviceRecovery} from "@/components/profile/device-recovery";
import {SettingsLogout} from "@/components/profile/settings-logout";
import {ThemeToggle} from "@/components/theme-toggle";
export const metadata={title:"Settings"};
export const dynamic="force-dynamic";
export default async function SettingsPage(){
 const user=await getSessionUser();if(!user)redirect("/login?next=/app/settings");
 const row="flex min-h-14 items-center justify-between rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-semibold";
 return <div className="mx-auto h-full w-full min-w-0 max-w-3xl overflow-y-auto px-4 py-6 pb-12">
 <h1 className="font-display text-2xl font-bold">Settings</h1>
 <nav aria-label="Settings" className="mt-5 grid gap-2"><Link className={row} href="/app/profile">Profile<span aria-hidden>›</span></Link><a className={row} href="#notifications">Notifications<span aria-hidden>↓</span></a><a className={row} href="#privacy">Privacy<span aria-hidden>↓</span></a><a className={row} href="#save-my-chats">Save my chats<span aria-hidden>↓</span></a><Link className={row} href="/app/help">Help<span aria-hidden>›</span></Link><SettingsLogout/></nav>
 <section id="notifications" className="mt-8 scroll-mt-4"><h2 className="mb-3 text-lg font-semibold">Notifications</h2><NotificationPreferences/></section>
 <section id="privacy" className="mt-8 scroll-mt-4"><h2 className="mb-3 text-lg font-semibold">Privacy</h2><PrivacySettings/>
 <details id="security" className="mt-4 rounded-xl border border-[var(--border)] p-4"><summary className="min-h-11 cursor-pointer font-semibold">Linked phones and account security</summary><EncryptionDevices hideBackups/><div id="two-step-verification"><TwoFactorAuth/></div><LoginHistory/><div id="data"><AccountDataSection/></div><Link className="mt-3 inline-flex min-h-11 items-center underline" href="/app/profile#account-security">Password and sign-in options</Link></details>
 </section>
 <section id="save-my-chats" className="mt-8 scroll-mt-4"><LocalChatBackupSettings/><details className="mt-4 rounded-xl border border-[var(--border)] p-4"><summary className="min-h-11 cursor-pointer font-semibold">More ways to save</summary><DeviceRecovery/><CloudRecoverySettings/></details></section>
 <div id="appearance" className="mt-6 flex min-h-11 items-center justify-between text-sm"><span>Dark mode</span><ThemeToggle/></div>
 <footer className="mt-8 flex gap-4 text-xs"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></footer>
 </div>;
}
