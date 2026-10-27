import Link from "next/link";
import { HelpPage } from "@/components/legal/help-page";
import { publicMetadata } from "@/lib/public-metadata";
import { publicSupportEmail } from "@/lib/support-contact";

export const metadata = publicMetadata("/support", "Circlo support and account help", "Get help signing in, opening your chats on a new device, deleting your account or reporting unwanted messages. Never share your password or recovery code.");
export const dynamic = "force-dynamic";

export default function SupportPage() {
  const email = publicSupportEmail(process.env.PUBLIC_SUPPORT_EMAIL);
  return <HelpPage title="How can we help?">
    <section><h2 className="text-lg font-semibold">Sign-in and chat access</h2><p><Link className="text-[var(--accent)] underline" href="/forgot-password">Forgot your password?</Link> Use your account email to set a new one. If you lost your old phone, sign in and choose “I don’t have my old device” to get an email code. That lets you use your account again and signs out other devices; it does not unlock older chats by itself.</p><p className="mt-2">To open older chats, link a phone that can still read them, or use the recovery words or file you saved. To bring back copies of messages and files, use your chat backup and its backup code. These are different from the code sent to your email.</p><Link className="text-[var(--accent)] underline" href="/app/profile?recovery=1#encryption-devices">Open recovery and backup options</Link></section>
    <section><h2 className="text-lg font-semibold">Unwanted messages or unsafe content</h2><p>In a chat, open the message menu and choose Report. You can also report or block a person from their chat options. Only details you choose to submit are included in the report; never send passwords or recovery codes. Blocking prevents new direct messages and calls, but does not remove shared group membership or copies already received.</p><Link className="text-[var(--accent)] underline" href="/login?next=%2Fapp%2Fchats">Open Circlo in your browser</Link></section>
    <section><h2 className="text-lg font-semibold">Delete your account</h2><p><Link className="text-[var(--accent)] underline" href="/delete-account">Request deletion and read what is removed or retained</Link>. Android installation is not required.</p></section>
    <section><h2 className="text-lg font-semibold">Privacy and support requests</h2>{email ? <p><a className="text-[var(--accent)] underline" href={`mailto:${email}`}>{email}</a>. Use your account&apos;s original email for ownership questions. Do not include passwords, one-time codes or recovery codes.</p> : <p>For sign-in and chat access, use the recovery options above. Signed-in users can report a safety concern from a chat. An additional public email contact is not available on this page yet.</p>}</section>
  </HelpPage>;
}
