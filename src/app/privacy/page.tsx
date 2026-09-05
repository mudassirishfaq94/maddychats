import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy — ZipTalk",
  description: "ZipTalk privacy policy. Learn how we collect, use, and protect your data.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--text)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <div className="mt-8 flex items-center gap-3">
          <Shield className="h-6 w-6 text-[var(--accent)]" />
          <h1 className="font-display text-3xl font-bold">Privacy Policy</h1>
        </div>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Last updated: September 4, 2026
        </p>

        <div className="prose-card mt-8 space-y-8 text-sm leading-relaxed text-[var(--muted)]">
          <section>
            <h2 className="text-base font-bold text-[var(--text)]">1. Information We Collect</h2>
            <p className="mt-2">
              When you use ZipTalk, we collect information you provide directly and information
              generated through your use of the service.
            </p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li><strong className="text-[var(--text)]">Account Information:</strong> Display name, username, email address, password (stored securely as a bcrypt hash), and optional bio and profile photo.</li>
              <li><strong className="text-[var(--text)]">Messages:</strong> Text messages, voice messages, images, files, and other media you send through the service.</li>
              <li><strong className="text-[var(--text)]">Usage Data:</strong> Login history (timestamps, IP addresses, browser information), device information, and interaction patterns within the app.</li>
              <li><strong className="text-[var(--text)]">Status Updates:</strong> Temporary status posts you choose to share.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--text)]">2. How We Use Your Information</h2>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>To provide, maintain, and improve the ZipTalk service</li>
              <li>To authenticate your account and ensure security</li>
              <li>To deliver messages, notifications, and media between users</li>
              <li>To detect and prevent spam, abuse, and security threats</li>
              <li>To comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--text)]">3. Data Storage & Security</h2>
            <p className="mt-2">
              Your data is stored on secure cloud infrastructure (Neon PostgreSQL). Messages and media
              are encrypted in transit using TLS. Passwords are hashed with bcrypt and are never
              stored in plaintext. We implement rate limiting, same-origin request guards, and
              session management to protect against unauthorized access.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--text)]">4. Data Sharing</h2>
            <p className="mt-2">
              We do not sell your personal data to third parties. Your information is only shared:
            </p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>With other users as part of the messaging service (your display name, username, and messages you send)</li>
              <li>When required by law or to protect the safety of our users</li>
              <li>With service providers who assist in operating the platform (hosting, email delivery)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--text)]">5. Your Privacy Controls</h2>
            <p className="mt-2">
              ZipTalk provides built-in privacy settings that you control:
            </p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li><strong className="text-[var(--text)]">Profile Visibility:</strong> Choose who can see your profile (everyone, contacts, or nobody).</li>
              <li><strong className="text-[var(--text)]">Last Seen:</strong> Control who can see when you were last active.</li>
              <li><strong className="text-[var(--text)]">Status Visibility:</strong> Control who sees your status updates.</li>
              <li><strong className="text-[var(--text)]">Who Can Message You:</strong> Restrict who can start conversations with you.</li>
              <li><strong className="text-[var(--text)]">Read Receipts:</strong> Toggle whether others see when you read messages.</li>
              <li><strong className="text-[var(--text)]">Typing Indicators:</strong> Toggle whether others see when you are typing.</li>
              <li><strong className="text-[var(--text)]">Block Users:</strong> Block specific users from contacting you.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--text)]">6. Your Rights</h2>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li><strong className="text-[var(--text)]">Download Your Data:</strong> You can export a copy of all your account data at any time from your profile settings.</li>
              <li><strong className="text-[var(--text)]">Delete Your Account:</strong> You can permanently delete your account and all associated data from your profile settings. This action cannot be undone.</li>
              <li><strong className="text-[var(--text)]">Report Abuse:</strong> You can report users or messages that violate our guidelines.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--text)]">7. Data Retention</h2>
            <p className="mt-2">
              We retain your data for as long as your account is active. When you delete your account,
              all associated data (messages, media, profile information) is permanently removed. Some
              data may be retained temporarily for audit purposes as required by law.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--text)]">8. Children&apos;s Privacy</h2>
            <p className="mt-2">
              ZipTalk is not intended for users under the age of 13. We do not knowingly collect
              personal information from children under 13.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--text)]">9. Changes to This Policy</h2>
            <p className="mt-2">
              We may update this privacy policy from time to time. We will notify you of any
              material changes by posting the new policy on this page and updating the &ldquo;Last
              updated&rdquo; date.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--text)]">10. Contact</h2>
            <p className="mt-2">
              If you have questions about this privacy policy or our data practices, please contact
              us through the ZipTalk application.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
