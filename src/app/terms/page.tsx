import { publicMetadata } from "@/lib/public-metadata";
import Link from "next/link";
import {
  Ban,
  CalendarClock,
  FileText,
  Gavel,
  KeyRound,
  LockKeyhole,
  Receipt,
  Scale,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import {
  LegalBody,
  LegalCallout,
  LegalChecklist,
  LegalClosing,
  LegalFooter,
  LegalHeader,
  LegalHero,
  LegalHighlights,
  LegalIndex,
  LegalPoints,
  LegalSection,
} from "@/components/legal/legal-shell";

export const metadata = publicMetadata("/terms", "Terms of Service — Circlo", "The agreement between you and Circlo: service terms, encrypted messaging, account responsibilities and your rights.");

const LAST_UPDATED = "30 October 2026";

const INDEX = [
  { id: "acceptance", label: "Acceptance of these terms" },
  { id: "service", label: "What Circlo is" },
  { id: "account", label: "Your account" },
  { id: "keys", label: "Protecting private chats" },
  { id: "content", label: "Your content" },
  { id: "use", label: "Acceptable use" },
  { id: "moderation", label: "Moderation and enforcement" },
  { id: "fees", label: "Fees and feature changes" },
  { id: "availability", label: "Availability and disclaimers" },
  { id: "liability", label: "Limitation of liability" },
  { id: "termination", label: "Suspension and termination" },
  { id: "law", label: "Governing law and disputes" },
  { id: "changes", label: "Changes to these terms" },
  { id: "contact", label: "Contact us" },
];

const HIGHLIGHTS = [
  {
    icon: LockKeyhole,
    text: "Encryption is part of the service, not an add-on — and it shapes what we can and cannot do for you.",
  },
  {
    icon: KeyRound,
    text: "Use Save my chats and keep its file and code separately. Linking from an old device is another way to bring over chats it can open.",
  },
  {
    icon: ScrollText,
    text: "You own what you send. We store locked copies of private messages that we cannot open, and we claim no rights over your content.",
  },
];

const ACCEPTABLE_USE = [
  "Sending spam, unsolicited bulk messages, or automated promotions.",
  "Harassing, threatening, bullying, or intimidating anyone.",
  "Posting hate speech, discriminatory content, or content that promotes violence.",
  "Sharing sexual content involving minors, or any content that sexualises children. This is reported to the relevant authorities.",
  "Sharing explicit or obscene content where it is unwanted.",
  "Impersonating a person, brand, or organisation.",
  "Running scams, phishing, or financial fraud.",
  "Attempting to access accounts, devices, or systems that are not yours.",
  "Scraping, crawling, or automating the service without our written permission.",
  "Uploading malware, or content designed to damage a device or network.",
  "Getting around sending limits, bans or safety controls, including by creating extra accounts.",
  "Using the service for anything unlawful, or to infringe another person's rights.",
];

const ENFORCEMENT = [
  "Removing readable content that breaks these terms.",
  "Restricting a feature, such as messaging, uploading, or status sharing.",
  "Issuing a warning, or temporarily suspending an account.",
  "Permanently closing an account, and blocking new accounts from the same person.",
  "Reporting illegal content or activity to the relevant authorities.",
];

const MODERATION = [
  {
    lead: "We can act on readable content.",
    text: "Profile details, avatars, group and community names, and status updates are stored in a readable form, so we can review reports about them and remove what breaks these terms.",
  },
  {
    lead: "We cannot read encrypted content.",
    text: "Reporting a message identifies it for investigation but does not automatically decrypt its contents for us. If support needs context, share only the details you choose to provide. Never send passwords or recovery information.",
  },
  {
    lead: "Metadata supports abuse prevention.",
    text: "Sending rates, duplicate sends, reports, blocks and account history inform enforcement. We cannot and do not scan encrypted message bodies.",
  },
  {
    lead: "We keep a record.",
    text: "Moderation and trust decisions are written to an audit trail, so enforcement stays accountable and reviewable.",
  },
];

const AVAILABILITY = [
  {
    lead: "No uptime guarantee.",
    text: "We work to keep Circlo running, but we do not promise uninterrupted service. Hosting capacity, maintenance, upstream provider limits, and network problems can all cause downtime or delay message delivery.",
  },
  {
    lead: "Features can change.",
    text: "We may add, change, pause, or retire features. Some capabilities are operated as limited or experimental and can be paused, including optional sign-in methods and device provisioning.",
  },
  {
    lead: "Choose what works for you.",
    text: "Check that Circlo works on your devices before relying on it for important conversations. It is not an emergency calling service. Your legal rights and any warranties required by law still apply.",
  },
  {
    lead: "Local law still applies.",
    text: "Nothing here excludes warranties or rights that cannot legally be excluded where you live.",
  },
];

const LIABILITY = [
  {
    lead: "Responsibility under the law.",
    text: "Responsibility for loss depends on the facts and applicable law. These terms do not remove rights or remedies that the law gives you.",
  },
  {
    lead: "Raise a problem with us.",
    text: "Contact support if a service problem causes harm. We will review the circumstances and the remedies available under applicable law. Circlo is currently free to use.",
  },
  {
    lead: "What cannot be limited.",
    text: "Nothing in these terms limits liability that the law does not allow us to limit, such as for death or personal injury caused by negligence, or for fraud.",
  },
  {
    lead: "Back up what matters.",
    text: "Your old chats depend on information saved on your devices or in your recovery file. Keep each saved file and its matching code or phrase safe, and keep another copy of anything irreplaceable.",
  },
];

const ACCOUNT = [
  {
    lead: "Age.",
    text: "You must be at least 13 years old, or older where local law sets a higher minimum age. Circlo is not for children below that age.",
  },
  {
    lead: "Accurate details.",
    text: "Register with information that is yours and correct, and keep it current.",
  },
  {
    lead: "One account each.",
    text: "Do not create multiple accounts to work around a ban, a limit, or another person's block.",
  },
  {
    lead: "Verify your email.",
    text: "New password accounts stay limited until the email address is verified. Verification also protects the account from someone registering in your name.",
  },
  {
    lead: "Protect your sign-in.",
    text: "Keep your password and extra sign-in codes private. Turn on an extra sign-in check and review your devices; you can remove a device at any time.",
  },
  {
    lead: "Tell us about misuse.",
    text: "If you believe someone else has access to your account, change your password and revoke the session immediately.",
  },
];

const KEY_DUTIES = [
  {
    lead: "Only approved devices can open chats.",
    text: "A device you already use must approve a new browser or phone. Someone who gets access to your signed-in account cannot quietly add a device to read your chats.",
  },
  {
    lead: "You control your devices.",
    text: "Approve only devices you recognise. Compare the safety codes when asked, and remove any device you do not recognise. Removing it stops it from opening new messages.",
  },
  {
    lead: "Save my chats before changing phones.",
    text: "Keep your encrypted chat backup file and its matching code. Additional chat-access recovery files use their matching 24-word phrase; optional recovery copies use their saved phrase or older code. These access copies are not message archives. Your email password alone cannot open old chats.",
  },
  {
    lead: "If you lose your saved copies.",
    text: "We cannot read your private messages or restore old chats for you. If you lose every approved device and the matching saved recovery information, earlier conversations may stay unreadable, including to you.",
  },
  {
    lead: "Protect your phone too.",
    text: "Chat protection cannot protect a device that has been taken over, a harmful app on your device, or someone looking at your screen. It also does not hide the chat details described in our Privacy Policy.",
  },
  {
    lead: "Do not weaken it.",
    text: "Do not try to extract, share, or publish other people's keys, and do not use the service to distribute tools intended to break its encryption.",
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-dvh bg-[var(--bg)]">
      <LegalHeader />
      <LegalHero
        badge="Terms of service"
        badgeIcon={FileText}
        title="The ground rules, in plain language."
        lead="These terms are the agreement between you and Circlo. They cover what the service does, what we expect from you, and what happens if something goes wrong. Private chat content is end-to-end encrypted. Account, delivery and publicly shared information are handled as described in our Privacy Policy."
        meta={[
          { icon: ScrollText, text: `Last updated: ${LAST_UPDATED}` },
          { icon: ShieldCheck, text: "Read together with our Privacy Policy" },
        ]}
      />
      <LegalHighlights items={HIGHLIGHTS} />

      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="card-flat flex flex-wrap items-start gap-4 rounded-3xl p-6">
          <ShieldAlert className="h-5 w-5 shrink-0 text-[var(--accent-fg)]" />
          <p className="max-w-3xl text-sm leading-7 text-[var(--muted)]">
            <strong className="text-[var(--text)]">The short version.</strong> Use Circlo for real conversations with
            people who want to hear from you. Keep your chat backup file and its matching code somewhere safe. Do not use the service to harm
            anyone or to break the law. We keep the service running, we do not sell your data, and we cannot read your
            encrypted messages even if we wanted to. The numbered sections below are the part that binds us both.
          </p>
        </div>
      </section>

      <LegalBody index={<LegalIndex entries={INDEX} />}>
        <LegalSection id="acceptance" number="1" title="Acceptance of these terms" icon={FileText}>
          <p>
            By creating an account or using Circlo, you agree to these terms. If you do not agree with them, do not use
            the service. If you are using Circlo on behalf of an organisation, you confirm that you are authorised to
            accept these terms for it.
          </p>
          <p>
            Our{" "}
            <Link
              href="/privacy"
              className="font-semibold text-[var(--accent-fg)] underline hover:text-[var(--text)]"
            >
              Privacy Policy
            </Link>{" "}
            explains how we handle personal data and forms part of this agreement. Where these terms and the Privacy
            Policy appear to conflict about data handling, the Privacy Policy governs.
          </p>
        </LegalSection>

        <LegalSection id="service" number="2" title="What Circlo is" icon={Users}>
          <p>
            Circlo is a private messaging service: one-to-one conversations, group chats, communities and channels, voice
            notes, photo and file sharing, status updates, reactions, replies, read receipts, pinned and starred
            messages, disappearing messages, and scheduled messages. Private messages are locked on your device before
            they are sent, as explained in section 4.
          </p>
          <p>
            You need an account to use it. You are responsible for the device and network you use to reach the service,
            and for anyone you allow to use a device where you are signed in.
          </p>
        </LegalSection>

        <LegalSection id="account" number="3" title="Your account" icon={UserCheck}>
          <LegalPoints points={ACCOUNT} />
        </LegalSection>

        <LegalSection id="keys" number="4" title="Protecting private chats" icon={KeyRound}>
          <p>
            Circlo locks private chat messages on your device before sending them. Our service delivers the locked
            copies and the public information needed to connect approved devices. It does not have what it needs to
            open your conversations. This protection is called end-to-end encryption, and it also means you must keep
            your backup file and its matching code safe.
          </p>
          <LegalPoints points={KEY_DUTIES} />
        </LegalSection>

        <LegalSection id="content" number="5" title="Your content" icon={LockKeyhole}>
          <p>
            You own the content you create and send. We claim no ownership over it. To operate the service we need a
            limited licence: to store, transmit and deliver your content to the recipients you choose, and to display
            what you publish, such as your profile and status updates, to the audience your settings allow. That licence
            exists only to run the service, and it ends when the content is deleted.
          </p>
          <p>
            You are responsible for what you send: that you have the right to share it, and that it does not break these
            terms or anyone else&apos;s rights. Because message content is encrypted, we cannot review it in advance.
          </p>
        </LegalSection>

        <LegalSection id="use" number="6" title="Acceptable use" icon={Ban}>
          <p>Circlo is for genuine conversation. You agree not to do any of the following:</p>
          <LegalChecklist items={ACCEPTABLE_USE} tone="note" />
        </LegalSection>

        <LegalSection id="moderation" number="7" title="Moderation and enforcement" icon={ShieldAlert}>
          <LegalPoints points={MODERATION} />
          <p>Depending on the situation, enforcement can include one or more of the following:</p>
          <LegalChecklist items={ENFORCEMENT} tone="note" />
          <p>
            To appeal, or to ask why an action was taken, contact us through Circlo support or the public email in section 14. We keep enforcement records so decisions can be reviewed.
          </p>
          <LegalCallout>
            If we receive a valid legal request, we can provide account records, details about chats and the locked
            copies of messages. We cannot provide readable private messages because we do not have what is needed to
            open them, and we will not weaken this protection for any request.
          </LegalCallout>
        </LegalSection>

        <LegalSection id="fees" number="8" title="Fees and feature changes" icon={Receipt}>
          <p>
            Circlo is currently free to use and we do not collect payment details. If we introduce paid features, we will
            explain what they cost and what they include before anything is charged, and the existing free service will
            not quietly become a paid one. You can stop using a paid feature at any time.
          </p>
        </LegalSection>

        <LegalSection id="availability" number="9" title="Availability and disclaimers" icon={CalendarClock}>
          <LegalPoints points={AVAILABILITY} />
        </LegalSection>

        <LegalSection id="liability" number="10" title="Limitation of liability" icon={Scale}>
          <LegalPoints points={LIABILITY} />
        </LegalSection>

        <LegalSection id="termination" number="11" title="Suspension and termination" icon={Trash2}>
          <p>
            You can stop using Circlo at any time, and you can delete your account from Settings → Privacy → Your phones and sign-in → Your Data. Deleting an account
            requires a typed confirmation and fresh authentication, and it removes your account data, the messages you
            sent, and the encryption keys registered to you, as described in our Privacy Policy.
          </p>
          <p>
            We may suspend or close an account that breaks these terms, that creates risk for other people or for the
            service, or where the law requires it. Where we can, we will say why and give you a chance to respond.
            Ending your access does not delete content that other people have already received, and it cannot remove a
            copy another participant&apos;s device has already decrypted and stored.
          </p>
        </LegalSection>

        <LegalSection id="law" number="12" title="Governing law and disputes" icon={Gavel}>
          <p>
            Circlo is operated independently from Dubai, United Arab Emirates. Applicable law determines your
            rights and the court able to hear a dispute. These terms do not require you to give up mandatory
            consumer protections or access to a court available to you under that law.
          </p>
          <p>
            Before starting formal proceedings, please raise the issue with us through the in-app support options so we
            can try to resolve it directly. If you are a consumer, nothing in these terms removes protections that are
            mandatory in your country of residence, including your right to bring proceedings locally.
          </p>
        </LegalSection>

        <LegalSection id="changes" number="13" title="Changes to these terms" icon={ScrollText}>
          <p>
            We may update these terms as the service evolves. When we do, we revise the date at the top of this page, and
            for a material change we will tell you in the app before it takes effect. If you keep using Circlo after a
            change takes effect, you accept the updated terms. If you do not accept them, stop using the service and
            delete your account.
          </p>
        </LegalSection>

        <LegalSection id="contact" number="14" title="Contact us" icon={ShieldCheck}>
          <p>
            Circlo is run independently by its creator in Dubai, United Arab Emirates. Questions about these terms,
            an enforcement decision, or a legal request can be sent to <a className="underline" href="mailto:mudassarmalak090@gmail.com">mudassarmalak090@gmail.com</a> or through <Link className="underline" href="/support">Circlo support</Link>. Our{" "}
            <Link
              href="/privacy"
              className="font-semibold text-[var(--accent-fg)] underline hover:text-[var(--text)]"
            >
              Privacy Policy
            </Link>{" "}
            explains how to reach us about a data protection request.
          </p>
        </LegalSection>
      </LegalBody>

      <LegalClosing
        title="Private conversations. Closer connections."
        text="Your devices open your private chats. Keep your chat backup file and its matching code somewhere safe."
        links={[
          { href: "/privacy", label: "Privacy Policy" },
          { href: "/signup", label: "Join your circle", primary: true },
        ]}
      />
      <LegalFooter label="Terms of service" lastUpdated={LAST_UPDATED} />
    </main>
  );
}
