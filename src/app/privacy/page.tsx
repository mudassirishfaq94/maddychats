import { publicMetadata } from "@/lib/public-metadata";
import Link from "next/link";
import {
  BellRing,
  CheckCheck,
  Database,
  EyeOff,
  Fingerprint,
  Globe2,
  KeyRound,
  LockKeyhole,
  ScrollText,
  ServerCog,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserCheck,
  Users,
  type LucideIcon,
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
  LegalSection,
} from "@/components/legal/legal-shell";

export const metadata = publicMetadata("/privacy", "Privacy Policy — Circlo", "What Circlo stores, what it can see, how chat messages are protected, and how you can control your information.");

const LAST_UPDATED = "30 October 2026";

/** Numbered sections, also used to build the jump-to index. */
const INDEX = [
  { id: "encryption", label: "How private chats work" },
  { id: "collect", label: "Information we collect" },
  { id: "metadata", label: "Details about your chats" },
  { id: "use", label: "How we use information" },
  { id: "sharing", label: "When information is shared" },
  { id: "security", label: "How we protect your data" },
  { id: "controls", label: "Your privacy controls" },
  { id: "rights", label: "Your rights and choices" },
  { id: "retention", label: "How long we keep data" },
  { id: "transfers", label: "Where data is processed" },
  { id: "children", label: "Children" },
  { id: "changes", label: "Changes to this policy" },
  { id: "contact", label: "Contact us" },
];

const HIGHLIGHTS = [
  { icon: LockKeyhole, text: "Your device locks messages before they are sent" },
  { icon: KeyRound, text: "Only approved devices can open your chats" },
  { icon: Fingerprint, text: "A device you already use must approve a new one" },
];

const NEVER_READ = [
  "Message text, captions, edits and replies in chats",
  "Photos, videos, voice notes and files shared in conversations",
  "Group and community message content",
  "Content of disappearing messages while they exist",
  "The secret information your devices use to open private chats",
];

const WE_HANDLE = [
  "Account details: display name, username, email, and any bio, avatar or phone number you add",
  "Details about chats: who is in a chat, when messages are sent, their size, and whether they were delivered or seen",
  "Security data: sign-in times, IP address, browser and device type, and an approximate country",
  "Status updates, avatars and group names, which are stored in a readable form because other people must be shown them",
  "Notification tokens, so your phone can tell you a message arrived",
];

const PROCESSORS: { name: string; role: string; region: string }[] = [
  {
    name: "Neon",
    role: "Database for accounts, locked messages and delivery details",
    region: "Singapore",
  },
  {
    name: "Bluehost",
    role: "Runs the Circlo app and background services",
    region: "Mumbai, India",
  },
  { name: "Cloudflare security", role: "Protects website traffic and checks for automated sign-in attempts", region: "Cloudflare network" },
  { name: "Cloudflare R2", role: "Private storage for photos, videos and files", region: "Cloudflare network" },
  { name: "Supabase", role: "Previous private media storage kept for rollback", region: "Mumbai, India" },
  { name: "Resend", role: "Delivery of verification and password-reset email", region: "United States" },
  {
    name: "Google, Apple, Mozilla",
    role: "Push notification delivery and optional Google sign-in for existing accounts",
    region: "Global",
  },
];

const CONTROLS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: UserCheck,
    title: "Profile visibility",
    text: "Choose whether everyone, your contacts, or nobody can view your profile.",
  },
  {
    icon: EyeOff,
    title: "Last seen and status visibility",
    text: "Decide who sees when you were last active and who can see your status updates.",
  },
  {
    icon: Users,
    title: "Who can message you",
    text: "Restrict who may start a conversation. First contact arrives as a request you accept or ignore.",
  },
  {
    icon: CheckCheck,
    title: "Read receipts and typing",
    text: "Choose whether to show when you have seen a message or are typing.",
  },
  {
    icon: Fingerprint,
    title: "Devices that can open your chats",
    text: "See approved devices, check their safety codes, and remove any device you no longer use.",
  },
  {
    icon: KeyRound,
    title: "Extra sign-in check",
    text: "Use an authenticator app for an extra check when you sign in or change important settings.",
  },
  {
    icon: BellRing,
    title: "Notifications",
    text: "Per-conversation mutes and per-channel notification preferences, controlled by you.",
  },
  {
    icon: Trash2,
    title: "Delete and clear",
    text: "Clear a conversation on your side, set messages to disappear, or delete your account.",
  },
];

const STEPS = [
  "When you first use Circlo on a device, it creates a secret for your chats and keeps it on that device. Circlo receives only the public information needed to connect approved devices.",
  "When you start a chat, your device sets up a private connection with each approved device belonging to the other person.",
  "Your device locks each message before sending it. Circlo stores and delivers the locked copy but does not have what it needs to open it.",
  "The other person's approved device opens the message. The information needed to do this is not sent to Circlo in a usable form.",
];

const NOT_COVERED = [
  "Your profile: display name, username, bio, avatar and links, which other people must be able to see.",
  "Group and community structure: names, avatars, membership, roles and admin settings.",
  "Status updates, which are stored in a readable form so they can be shown to your chosen audience and reviewed if reported.",
  "Details about chats: who is talking, when and how often messages are sent, and their size.",
  "Security and account data: sign-in history, device and browser labels, and approximate country.",
  "Anything you deliberately send to us, such as a report, a support message or a verification request.",
];

const USE = [
  "To run Circlo: signing you in, sending messages to the right devices, keeping your devices in sync, and showing you your information.",
  "To protect accounts: limiting repeated attempts, checking sign-ins, approving new devices, and sending security alerts.",
  "To reduce abuse: spotting unusual sending patterns, repeated messages and reports, and letting you block accounts. We cannot read private chat messages to scan them.",
  "To support you: answering in-app support threads and resolving the account problems you raise.",
  "To meet legal obligations: responding to valid legal requests to the extent we are able, and keeping the audit records that make administrative actions accountable.",
];

const SAFEGUARDS = [
  "The connection between your device and Circlo is protected against people trying to read or change data on the way.",
  "We do not store your password in readable form. Sign-in, password reset and sensitive actions have limits to slow repeated attempts.",
  "Your sign-in stays in a protected browser cookie. Important changes are checked to make sure they came from Circlo.",
  "Important actions — such as deleting your account or removing a trusted device — ask you to prove it is really you again. Some also ask for an extra sign-in check.",
  "Files are kept private and each request to open one is checked. Private chat files stay locked while stored and sent.",
  "Files meant to be viewed by others are checked and prepared for display. Virus scanning is used only where it is set up.",
  "We keep a record when devices are approved or removed and when chat protection changes. You can review device activity in settings.",
  "Previews and search use information opened on your own device instead of a readable server copy.",
];

const RETENTION = [
  "Account and profile data is kept for as long as your account exists.",
  "Messages and attachments stay until you delete them, until the conversation is deleted, or until a disappearing-message timer or retention cleanup removes them.",
  "Media that is no longer referenced by any message, status or profile is removed by a retention process once it is older than 24 hours.",
  "Status updates expire, and their media is deleted after they expire.",
  "Sign-in and security records are kept for a limited window so we can show you recent activity and investigate misuse.",
  "Administrative audit records are retained so that moderation and trust changes stay accountable.",
];

const RIGHTS = [
  {
    lead: "Access and portability.",
    text: "You can export your account information from your profile and download one conversation as a data file. Private messages stay locked in the download because the export runs on servers that cannot open them.",
  },
  {
    lead: "Correction.",
    text: "You can edit your profile, contacts and settings yourself at any time.",
  },
  {
    lead: "Deletion.",
    text: "You can clear a conversation, set messages to disappear, or delete your account permanently. Account deletion needs a typed confirmation plus fresh authentication.",
  },
  {
    lead: "Objection and restriction.",
    text: "You can turn off read receipts, typing indicators, last-seen sharing and notifications, and you can block accounts at any time.",
  },
  {
    lead: "Complaints.",
    text: "If you are in the European Economic Area, the United Kingdom, or another region with data protection authorities, you may complain to your local supervisory authority. We would appreciate the chance to put things right with you first.",
  },
];

const COLLECTED: { lead: string; text: string }[] = [
  {
    lead: "Account and profile.",
    text: "Display name, username, email address, and anything optional you add such as a bio, avatar, phone number or links. We store a protected check of your password, not the password itself, and never email it to you.",
  },
  {
    lead: "Private chat content.",
    text: "Message text, captions, edits, reactions, attachments and voice notes. Your device locks this content before sending; only approved devices in the chat can open it.",
  },
  {
    lead: "Readable content you publish.",
    text: "Profile photos, group and community names and avatars, and status updates. These are processed and stored in a readable form because they have to be displayed to other people and can be reported.",
  },
  {
    lead: "Security and device data.",
    text: "When sign-ins happen and whether they succeed, your internet address, browser and device names, an approximate country, active sign-ins, and public device codes used to set up private chats.",
  },
  {
    lead: "Operational data.",
    text: "Sending rates and abuse signals such as excessive or duplicate sends, reports you file, and administrative actions, which we keep for accountability.",
  },
  {
    lead: "Device permissions.",
    text: "Camera, microphone, files and notifications are requested only when a feature needs them, and used only for that feature.",
  },
];

const SHARING: { lead: string; text: string }[] = [
  {
    lead: "With other users.",
    text: "People in your conversations receive what you send, and their approved devices open it. People who can see your profile can see the details and activity your privacy settings allow.",
  },
  {
    lead: "With the people who run Circlo.",
    text: "Administrators can see account records and details about chats, and can remove content that breaks our terms. They cannot read private chat messages. Sensitive administrator actions require another identity check and are recorded.",
  },
  {
    lead: "Legal requests.",
    text: "If we receive a valid legal request, we can provide account records, details about chats and the locked copies of messages. We cannot provide readable private messages because we do not have what is needed to open them. Where allowed, we will tell you if a request concerns your account.",
  },
  {
    lead: "With service providers.",
    text: "We use a small number of processors under contract, each limited to what it needs to do its job. We never hand them your message keys.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-[var(--bg)]">
      <LegalHeader />
      <LegalHero
        badge="Privacy policy"
        badgeIcon={LockKeyhole}
        title="Your privacy, in plain language."
        lead="Your device locks private messages, attachments and voice notes before sending them. Circlo stores a locked copy it cannot open. This page explains what information we keep, what we can see, and the controls you have."
        meta={[
          { icon: ScrollText, text: `Last updated: ${LAST_UPDATED}` },
          { icon: Globe2, text: "Applies to the Circlo web app, Android app and this website" },
        ]}
      />
      <LegalHighlights items={HIGHLIGHTS} />

      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-4 md:grid-cols-2">
          <article className="card-flat rounded-3xl p-6">
            <h2 className="font-display flex items-center gap-2 text-lg font-semibold">
              <LockKeyhole className="h-5 w-5 text-[var(--accent-fg)]" /> What we can never read
            </h2>
            <div className="mt-4 text-sm leading-7 text-[var(--muted)]">
              <LegalChecklist items={NEVER_READ} />
            </div>
          </article>
          <article className="card-flat rounded-3xl p-6">
            <h2 className="font-display flex items-center gap-2 text-lg font-semibold">
              <Database className="h-5 w-5 text-[var(--muted)]" /> What we do handle
            </h2>
            <div className="mt-4 text-sm leading-7 text-[var(--muted)]">
              <LegalChecklist items={WE_HANDLE} tone="note" />
            </div>
          </article>
        </div>
        <p className="mt-4 text-xs leading-6 text-[var(--muted)]">
          Chat protection hides message contents. It does not hide which accounts are talking or when, so we explain
          those details separately in section 3.
        </p>
      </section>

      <LegalBody index={<LegalIndex entries={INDEX} />}>
        <LegalSection id="encryption" number="1" title="How private chats work" icon={LockKeyhole}>
          <p>
            Circlo locks each private message on your device before it is sent. Only approved devices in the chat can
            open it. This is called end-to-end encryption. It is always on for private chats; the service rejects a
            private message if it is not locked first.
          </p>

          <h3 className="font-display pt-2 text-base font-semibold text-[var(--text)]">How a message travels</h3>
          <ol className="space-y-3">
            {STEPS.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent-fg)]">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <h3 className="font-display pt-2 text-base font-semibold text-[var(--text)]">Group chats</h3>
          <p>
            Each person&apos;s approved devices get what they need to open new group messages. When someone joins, they
            cannot read earlier messages. When someone leaves or is removed, their devices cannot open later messages.
          </p>

          <h3 className="font-display pt-2 text-base font-semibold text-[var(--text)]">
            Devices that can open your chats
          </h3>
          <p>
            A new browser or phone can be linked only after approval from a device you already use. If you no longer
            have an existing device, use the recovery phrase or file you saved to restore chat access. To link one, scan
            its temporary QR code
            and compare the safety code shown on both devices before you approve it. The QR code expires after three
            minutes and does not contain the secret information needed to open chats. Removing a device stops it from
            getting what it needs for new messages. Circlo also stores a locked recovery copy for this device; only the
            separate recovery code you save can open that copy. Circlo does not receive that code.
          </p>
          <p>
            Today, the web and Android app keep the information needed to open chats in saved data on that device.
            Physical security keys and a word-based recovery phrase are not available yet. Before clearing saved data,
            make a recovery file or link another device. Otherwise, you may lose access to older chats.
          </p>
          <LegalCallout>
            Circlo staff and administrators cannot open your private messages because the needed secret information is
            kept on your devices. If you lose every approved device and your recovery code or file, you may permanently
            lose access to earlier chats. We cannot restore messages without that information.
          </LegalCallout>

          <h3 className="font-display pt-2 text-base font-semibold text-[var(--text)]">
            What encryption does not cover
          </h3>
          <LegalChecklist items={NOT_COVERED} tone="note" />
          <p>
            Circlo stores a locked copy of private messages, so it cannot search their contents for you. Notifications
            can tell you a message arrived, but the service cannot read the message to add its contents.
          </p>
          <p className="text-[13px] leading-6">
            <strong className="text-[var(--text)]">Independent review.</strong> This page explains how private chat
            protection is designed to work. We have not published a review by an independent security specialist.
          </p>
        </LegalSection>

        <LegalSection id="collect" number="2" title="Information we collect" icon={Database}>
          <p>Cloudflare helps block automated sign-in attempts. It receives connection and browser information for these security checks. Our verification request contains the check result, without chat messages or encryption keys.</p>
          <p>We collect information needed to run a messaging service. Chat contents and the details needed to deliver them are different, so we explain them separately.</p>
          <ul className="space-y-4">
            {COLLECTED.map((item) => (
              <li key={item.lead}>
                <strong className="text-[var(--text)]">{item.lead}</strong> {item.text}
              </li>
            ))}
          </ul>
          <p>
            This website and the app carry no advertising networks and no third-party behavioural analytics, and we do not
            build advertising profiles of you.
          </p>
        </LegalSection>

        <LegalSection id="metadata" number="3" title="Details about your chats" icon={ServerCog}>
          <p>
            Although private message contents are locked, our service needs some details to deliver them: which accounts
            are in a chat, when a message or reaction was sent, its size and type, whether it was opened, and which
            devices are online. These details can reveal who is talking and when.
          </p>
          <p>
            We use these details to deliver messages, keep sign-ins and notifications working, slow spam and abuse, and
            check that the service is working. We do not sell them or use them to build
            advertising profiles.
          </p>
        </LegalSection>

        <LegalSection id="use" number="4" title="How we use information" icon={ShieldCheck}>
          <LegalChecklist items={USE} />
          <p>
            Where data protection law requires us to name a legal basis, we rely on the performance of our contract with
            you (operating the service), our legitimate interests (security, abuse prevention and service integrity),
            your consent (optional notifications, and anything you choose to publish), and compliance with legal
            obligations where they apply. We do not sell personal information, and we do not share message content or
            contact lists for advertising.
          </p>
        </LegalSection>

        <LegalSection id="sharing" number="5" title="When information is shared" icon={Users}>
          <ul className="space-y-3">
            {SHARING.map((item) => (
              <li key={item.lead}>
                <strong className="text-[var(--text)]">{item.lead}</strong> {item.text}
              </li>
            ))}
          </ul>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
              <caption className="sr-only">Service providers that process Circlo data</caption>
              <thead>
                <tr className="border-b border-[var(--border-strong)] text-[11px] uppercase tracking-[.12em] text-[var(--text)]">
                  <th scope="col" className="py-2.5 pr-4 font-semibold">
                    Provider
                  </th>
                  <th scope="col" className="py-2.5 pr-4 font-semibold">
                    What it does
                  </th>
                  <th scope="col" className="py-2.5 font-semibold">
                    Processing region
                  </th>
                </tr>
              </thead>
              <tbody>
                {PROCESSORS.map((provider) => (
                  <tr key={provider.name} className="border-b border-[var(--border)] align-top">
                    <th scope="row" className="py-3 pr-4 font-semibold text-[var(--text)]">
                      {provider.name}
                    </th>
                    <td className="py-3 pr-4">{provider.role}</td>
                    <td className="py-3">{provider.region}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </LegalSection>

        <LegalSection id="security" number="6" title="How we protect your data" icon={Fingerprint}>
          <p>
            Chat message contents are locked before they reach our service. We also use the following safeguards to protect accounts and other information.
          </p>
          <LegalChecklist items={SAFEGUARDS} />
        </LegalSection>

        <LegalSection id="controls" number="7" title="Your privacy controls" icon={SlidersHorizontal}>
          <p>These live in your profile and take effect immediately.</p>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            {CONTROLS.map(({ icon: Icon, title, text }) => (
              <article key={title} className="card-flat rounded-2xl p-5">
                <div className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0 text-[var(--accent-fg)]" />
                  <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
                </div>
                <p className="mt-2 text-[13px] leading-6">{text}</p>
              </article>
            ))}
          </div>
        </LegalSection>

        <LegalSection id="rights" number="8" title="Your rights and choices" icon={UserCheck}>
          <ul className="space-y-3">
            {RIGHTS.map((item) => (
              <li key={item.lead}>
                <strong className="text-[var(--text)]">{item.lead}</strong> {item.text}
              </li>
            ))}
          </ul>
        </LegalSection>

        <LegalSection id="retention" number="9" title="How long we keep data" icon={Trash2}>
          <LegalChecklist items={RETENTION} />
          <p>
            Deleting your account removes your account data, the messages you sent and the registered chat-device information from the live database. Unused uploads can be cleaned up after 24 hours; failed deletions are retried. Files still used by other people or groups remain. Some security and moderation records may be kept to investigate abuse, and copies in provider backups follow their own deletion schedule. Deletion cannot erase a copy another person has already opened or downloaded. Read the <Link className="underline" href="/delete-account">account-deletion instructions</Link> before proceeding.
          </p>
        </LegalSection>

        <LegalSection id="transfers" number="10" title="Where data is processed" icon={Globe2}>
          <p>
            Circlo runs on the providers listed in section 5, including Singapore, India, the United States, and the European Union. Where personal
            data moves between regions we rely on safeguards required by law, and each provider publishes its own
            transfer terms. Private messages remain locked wherever they are stored.
          </p>
        </LegalSection>

        <LegalSection id="children" number="11" title="Children" icon={Users}>
          <p>
            Circlo is not intended for children under 13, or under a higher minimum age where local law sets one. We do
            not knowingly collect personal information from children below that age. If we learn that such an account
            exists we will remove it and its data, and a parent or guardian can contact us if they believe this has
            happened.
          </p>
        </LegalSection>

        <LegalSection id="changes" number="12" title="Changes to this policy" icon={ScrollText}>
          <p>
            When our practices change, we update this page and its date. If a change materially affects what we collect
            or how encryption works, we will tell you in the app before it takes effect. Previous versions are available
            on request, so you can see exactly what changed.
          </p>
        </LegalSection>

        <LegalSection id="contact" number="13" title="Contact us" icon={ShieldCheck}>
          <p>Circlo is run independently by its creator in Dubai, United Arab Emirates. For privacy questions or requests about your data, email <a className="underline" href="mailto:mudassarmalak090@gmail.com">mudassarmalak090@gmail.com</a>.</p>
          <p>
            Visit <Link className="underline" href="/support">Circlo support</Link> for account access, reporting and the available contact options. You can <Link className="underline" href="/delete-account">request account deletion from your browser</Link> without installing the Android app. Do not send your password, verification codes or encryption recovery material with a request.
          </p>
        </LegalSection>
      </LegalBody>

      <LegalClosing
        title="Your circle. Your secrets. Sealed."
        text="Everything above describes what the app actually does — you can review the same design in your own encryption settings."
        links={[
          { href: "/terms", label: "Terms of Service" },
          { href: "/signup", label: "Join your circle", primary: true },
        ]}
      />
      <LegalFooter label="Privacy policy" lastUpdated={LAST_UPDATED} />
    </main>
  );
}
