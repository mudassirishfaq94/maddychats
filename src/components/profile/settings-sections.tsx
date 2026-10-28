"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { SettingsLogout } from "./settings-logout";

const loading = () => <p role="status" className="py-4 text-sm text-[var(--muted)]">Opening…</p>;
const Notifications = dynamic(() => import("./notification-preferences").then(m => m.NotificationPreferences), { loading });
const Privacy = dynamic(() => import("./privacy-settings").then(m => m.PrivacySettings), { loading });
const Backup = dynamic(() => import("./local-chat-backup").then(m => m.LocalChatBackupSettings), { loading });
const LegacyFile = dynamic(() => import("./device-recovery").then(m => m.DeviceRecovery), { loading });
const LegacyWords = dynamic(() => import("./cloud-recovery").then(m => m.CloudRecoverySettings), { loading });
const Phones = dynamic(() => import("./encryption-devices").then(m => m.EncryptionDevices), { loading });
const ExtraSignIn = dynamic(() => import("./two-factor-auth").then(m => m.TwoFactorAuth), { loading });
const SignIns = dynamic(() => import("./login-history").then(m => m.LoginHistory), { loading });
const AccountData = dynamic(() => import("./account-data").then(m => m.AccountDataSection), { loading });
const Theme = dynamic(() => import("../theme-toggle").then(m => m.ThemeToggle), { loading });
const subscribe = (notify: () => void) => { window.addEventListener("hashchange", notify); return () => window.removeEventListener("hashchange", notify); };
const readHash = () => window.location.hash.slice(1);
const serverHash = () => "";

function PhoneSettings({ recoveryEmail, expanded }: { recoveryEmail?: string; expanded: boolean }) {
  const [open, setOpen] = useState(expanded);
  return <details id="security" className="mt-5 rounded-xl border border-[var(--border)] p-4" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer font-semibold">Your phones and sign-in</summary>
    {open ? <><Phones hideBackups recoveryEmail={recoveryEmail}/><div id="two-step-verification"><ExtraSignIn/></div><SignIns/><div id="data"><AccountData/></div><Link className="mt-3 inline-flex min-h-11 items-center underline" href="/app/profile#account-security">Password and sign-in options</Link></> : null}
  </details>;
}
function OlderBackups() {
  const [open, setOpen] = useState(false);
  return <details className="mt-5 rounded-xl border border-[var(--border)] p-4" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer font-medium">Use an older backup</summary>
    {open ? <><LegacyFile restoreOnly/><LegacyWords restoreOnly/></> : null}
  </details>;
}

/** Mount only the chosen screen; unopened settings do no fetching or crypto work. */
export function SettingsSections({ recoveryEmail }: { recoveryEmail?: string }) {
  const hash = useSyncExternalStore(subscribe, readHash, serverHash);
  const security = ["security", "two-step-verification", "data", "encryption-devices"].includes(hash);
  const section = hash === "notifications" ? "notifications" : hash === "privacy" || hash === "appearance" || security ? "privacy" : ["save-my-chats", "cloud-recovery", "local-chat-backup"].includes(hash) ? "backup" : "home";
  const row = "flex min-h-14 items-center justify-between rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-semibold";
  const title = section === "notifications" ? "Notifications" : section === "privacy" ? "Privacy" : section === "backup" ? "Save my chats" : "Settings";
  return <div className="mx-auto h-full w-full min-w-0 max-w-3xl overflow-y-auto px-4 py-6 pb-12">
    {section !== "home" ? <a href="#" className="mb-3 inline-flex min-h-11 items-center text-sm underline" aria-label="Back to settings">Back</a> : null}
    <h1 className="font-display text-2xl font-bold">{title}</h1>
    {section === "home" ? <><nav aria-label="Settings" className="mt-5 grid gap-2"><Link className={row} href="/app/profile">Profile<span aria-hidden>›</span></Link><a className={row} href="#notifications">Notifications<span aria-hidden>›</span></a><a className={row} href="#privacy">Privacy<span aria-hidden>›</span></a><a className={row} href="#save-my-chats">Save my chats<span aria-hidden>›</span></a><Link className={row} href="/app/help">Help<span aria-hidden>›</span></Link><SettingsLogout/></nav><footer className="mt-8 flex gap-4 text-xs"><Link href="/privacy">Privacy policy</Link><Link href="/terms">Terms</Link></footer></> : null}
    {section === "notifications" ? <section id="notifications" className="mt-5"><Notifications/></section> : null}
    {section === "privacy" ? <section id="privacy" className="mt-5"><Privacy/><div id="appearance" className="mt-5 flex min-h-11 items-center justify-between text-sm"><span>Dark mode</span><Theme/></div><PhoneSettings key={hash} expanded={security} recoveryEmail={recoveryEmail}/></section> : null}
    {section === "backup" ? <section id="save-my-chats"><Backup/><OlderBackups/></section> : null}
  </div>;
}
