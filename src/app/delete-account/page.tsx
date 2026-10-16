import Link from "next/link";
import { HelpPage } from "@/components/legal/help-page";
import { publicMetadata } from "@/lib/public-metadata";
import { publicSupportEmail } from "@/lib/support-contact";

export const metadata = publicMetadata("/delete-account", "Delete your Circlo account", "Request deletion of your Circlo account in your browser, understand what is removed and retained, and recover access securely if you lost your device.");
export const dynamic = "force-dynamic";

export default function DeleteAccountPage() {
  const email = publicSupportEmail(process.env.PUBLIC_SUPPORT_EMAIL);
  return <HelpPage title="Delete your Circlo account">
    <p>You can delete your account from this website. You do not need to install the Android app. Deletion is permanent and applies to the same Circlo account on all devices.</p>
    <Link className="btn btn-primary inline-flex max-w-full whitespace-normal text-center" href="/login?next=%2Fapp%2Fprofile%23account-data">Sign in to delete my account</Link>
    <section><h2 className="text-lg font-semibold">How to request deletion</h2>
      <ol className="list-decimal space-y-2 pl-5"><li>Sign in using your existing Circlo email or Google account.</li><li>Open Settings → Your Data → Delete my account.</li><li>Confirm your identity when asked, read the warning and type DELETE. Nothing is deleted just by opening this page.</li></ol>
    </section>
    <section><h2 className="text-lg font-semibold">Lost your password or trusted device?</h2>
      <p><Link className="text-[var(--accent)] underline" href="/forgot-password">Reset your password by email</Link>. If sign-in asks for a trusted device you no longer have, choose email recovery in the device-access screen. Recover your existing account; do not create another account to delete it. Email recovery cannot recreate lost encryption keys.</p>
      {email ? <p>If you cannot complete those steps, <a className="text-[var(--accent)] underline" href={`mailto:${email}?subject=Circlo%20account%20deletion%20request`}>email an account-deletion request</a> from the account&apos;s original email. Do not send passwords, recovery files or codes. We must verify ownership before acting.</p> : <p>If you cannot access your original email or complete recovery, self-service deletion cannot verify ownership. See <Link className="text-[var(--accent)] underline" href="/support">account support</Link> for the available options.</p>}
    </section>
    <section><h2 className="text-lg font-semibold">What deletion removes</h2><p>The live account record, registered authentication identities, sessions, device approvals, account settings, contacts, your sent messages and their database attachment references are removed. Other users&apos; accounts and messages remain. Shared group identity and content created by other members may remain.</p></section>
    <section><h2 className="text-lg font-semibold">Media, copies and retained records</h2><p>Unreferenced uploaded files become eligible for cleanup after 24 hours. Cleanup retries failed storage deletions; deleting the account does not prove every stored object or backup has already been erased. Files still referenced by other users or a group remain. Recipients may retain copies they already downloaded or decrypted.</p><p>Limited security or moderation records may remain for abuse investigation. Provider backups follow their configured lifecycle; Circlo does not promise immediate backup erasure. See the <Link className="text-[var(--accent)] underline" href="/privacy#retention">retention disclosure</Link>. Downloaded files and recovery backups on your own devices must be removed by you.</p></section>
  </HelpPage>;
}
