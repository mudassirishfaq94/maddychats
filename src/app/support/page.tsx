import Link from "next/link";
import { HelpPage } from "@/components/legal/help-page";
import { publicMetadata } from "@/lib/public-metadata";
import { publicSupportEmail } from "@/lib/support-contact";

export const metadata = publicMetadata("/support", "Circlo support and account help", "Get help signing in, opening your chats on a new device, deleting your account or reporting unwanted messages. Never share your password or recovery code.");
export const dynamic = "force-dynamic";

export default function SupportPage() {
  const email = publicSupportEmail(process.env.PUBLIC_SUPPORT_EMAIL) ?? "mudassarmalak090@gmail.com";
  return <HelpPage title="How can we help?">
    <section><h2 className="text-lg font-semibold">Sign-in and chat access</h2><p><Link className="text-[var(--accent)] underline" href="/forgot-password">Forgot your password?</Link> Request a reset using your account email. If you no longer have a device that can open your chats, sign in and choose the recovery options shown. Email recovery restores account access, but cannot bring back old chats on its own. To reopen saved chats, use your chat backup file and its matching code, or link from an old device that can still open them. Additional recovery files need their matching 24-word phrase.</p></section>
    <section><h2 className="text-lg font-semibold">Changing phones</h2><p>Before changing phones, open Settings → Save my chats. Save the encrypted file and keep its code separately. Check that saving finished and keep the old phone until you can open your chats on the new one. A chat-access recovery file under More ways to save contains access information, not a copy of messages or media. Support cannot replace a lost file or phrase.</p></section>
    <section><h2 className="text-lg font-semibold">Unwanted messages or unsafe content</h2><p>In a chat, open the message menu and choose Report. You can also report or block a person from their chat options. Only details you choose to submit are included in the report; never send passwords or recovery codes. Blocking prevents new direct messages and calls, but does not remove shared group membership or copies already received.</p><Link className="text-[var(--accent)] underline" href="/login?next=%2Fapp%2Fchats">Open Circlo in your browser</Link></section>
    <section><h2 className="text-lg font-semibold">Delete your account</h2><p><Link className="text-[var(--accent)] underline" href="/delete-account">Request deletion and read what is removed or retained</Link>. Android installation is not required.</p></section>
    <section><h2 className="text-lg font-semibold">Privacy and support requests</h2>{email ? <p><a className="text-[var(--accent)] underline" href={`mailto:${email}`}>{email}</a>. Use your account&apos;s original email for ownership questions. Do not include passwords, one-time codes or recovery codes.</p> : <p>For sign-in and chat access, use the recovery options above. Signed-in users can report a safety concern from a chat. An additional public email contact is not available on this page yet.</p>}</section>
  </HelpPage>;
}
