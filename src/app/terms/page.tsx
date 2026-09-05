import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service — ZipTalk",
  description: "ZipTalk terms of service and community guidelines.",
};

export default function TermsPage() {
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
          <FileText className="h-6 w-6 text-[var(--accent)]" />
          <h1 className="font-display text-3xl font-bold">Terms of Service</h1>
        </div>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Last updated: September 4, 2026
        </p>

        <div className="prose-card mt-8 space-y-8 text-sm leading-relaxed text-[var(--muted)]">
          <section>
            <h2 className="text-base font-bold text-[var(--text)]">1. Acceptance of Terms</h2>
            <p className="mt-2">
              By accessing or using ZipTalk, you agree to be bound by these Terms of Service.
              If you do not agree to these terms, do not use the service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--text)]">2. Description of Service</h2>
            <p className="mt-2">
              ZipTalk is a real-time messaging application that allows users to communicate
              through text messages, voice messages, images, files, and status updates. The service
              includes features such as group conversations, message reactions, read receipts, and
              privacy controls.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--text)]">3. Account Registration</h2>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>You must be at least 13 years old to create an account.</li>
              <li>You must provide accurate and complete registration information.</li>
              <li>You are responsible for maintaining the security of your account credentials.</li>
              <li>You must not create multiple accounts for the same person.</li>
              <li>You must not use another person&apos;s identity or impersonate anyone.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--text)]">4. Community Guidelines</h2>
            <p className="mt-2">You agree not to:</p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>Send spam, unsolicited messages, or bulk communications.</li>
              <li>Harass, bully, threaten, or intimidate other users.</li>
              <li>Post hate speech, discriminatory content, or content promoting violence.</li>
              <li>Share explicit, obscene, or sexually explicit content.</li>
              <li>Spread misinformation or engage in deceptive practices.</li>
              <li>Impersonate another person, brand, or organization.</li>
              <li>Engage in scams, phishing, or financial fraud.</li>
              <li>Attempt to gain unauthorized access to other accounts or systems.</li>
              <li>Use automated tools, bots, or scrapers without permission.</li>
              <li>Upload malware, viruses, or malicious code.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--text)]">5. Intellectual Property</h2>
            <p className="mt-2">
              You retain ownership of the content you create and share on ZipTalk. By sending
              messages, you grant ZipTalk a limited license to process and deliver your content
              to other participants in the conversation. We do not claim ownership of your content.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--text)]">6. Privacy</h2>
            <p className="mt-2">
              Your use of ZipTalk is also governed by our{" "}
              <Link href="/privacy" className="text-[var(--accent)] underline hover:text-[var(--text)]">
                Privacy Policy
              </Link>
              , which describes how we collect, use, and protect your information.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--text)]">7. Enforcement</h2>
            <p className="mt-2">
              We reserve the right to take action against accounts that violate these terms,
              including:
            </p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>Removing violating content</li>
              <li>Issuing warnings</li>
              <li>Temporarily suspending accounts</li>
              <li>Permanently banning accounts</li>
              <li>Reporting illegal activity to law enforcement</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--text)]">8. Account Deletion</h2>
            <p className="mt-2">
              You may delete your account at any time from your profile settings. Account deletion
              is permanent and removes all your data including messages, media, and profile
              information. Deleted accounts cannot be recovered.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--text)]">9. Service Availability</h2>
            <p className="mt-2">
              We strive to maintain high availability but do not guarantee uninterrupted access.
              We may perform maintenance, updates, or experience outages that temporarily affect
              the service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--text)]">10. Limitation of Liability</h2>
            <p className="mt-2">
              ZipTalk is provided &ldquo;as is&rdquo; without warranties of any kind. We are
              not liable for any damages arising from your use of the service, including but not
              limited to direct, indirect, incidental, or consequential damages.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[var(--text)]">11. Changes to Terms</h2>
            <p className="mt-2">
              We may update these terms from time to time. Continued use of the service after
              changes constitutes acceptance of the updated terms.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
