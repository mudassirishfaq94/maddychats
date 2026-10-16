import { publicMetadata } from "@/lib/public-metadata";
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

export const metadata = publicMetadata("/privacy", "Privacy Policy — Circlo", "How Circlo handles your data: end-to-end encrypted messages, service metadata, account recovery and the privacy controls you have.");

const LAST_UPDATED = "14 October 2026";

/** Numbered sections, also used to build the jump-to index. */
const INDEX = [
  { id: "encryption", label: "End-to-end encryption" },
  { id: "collect", label: "Information we collect" },
  { id: "metadata", label: "Metadata we handle" },
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
  { icon: LockKeyhole, text: "Encrypted on your device before anything is uploaded" },
  { icon: KeyRound, text: "No message keys on our servers — none exist there to leak" },
  { icon: Fingerprint, text: "New browsers and phones must be approved by a device you already trust" },
];

const NEVER_READ = [
  "Message text, captions, edits and replies in chats",
  "Photos, videos, voice notes and files shared in conversations",
  "Group and community message content",
  "Content of disappearing messages while they exist",
  "The private half of your device keys — the copy we hold is itself encrypted with a secret that never leaves your device",
];

const WE_HANDLE = [
  "Account details: display name, username, email, and any bio, avatar or phone number you add",
  "Conversation metadata: who is in a chat, when a message was sent, how large it is, delivery and read state",
  "Security data: sign-in times, IP address, browser and device type, and an approximate country",
  "Status updates, avatars and group names, which are stored in a readable form because other people must be shown them",
  "Notification tokens, so your phone can tell you a message arrived",
];

const PROCESSORS: { name: string; role: string; region: string }[] = [
  {
    name: "Neon",
    role: "Managed PostgreSQL database (accounts, ciphertext, metadata)",
    region: "United States / European Union",
  },
  {
    name: "Supabase",
    role: "Private object storage for media and encryption envelopes",
    region: "Selected data region; reads are authorized through the app only",
  },
  { name: "Render", role: "Application hosting and TLS termination", region: "United States" },
  { name: "Resend", role: "Delivery of verification and password-reset email", region: "United States" },
  {
    name: "Google, Apple, Mozilla",
    role: "Push notification delivery and, if you choose it, Google sign-in",
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
    text: "Turn read receipts and typing indicators off independently, at any time.",
  },
  {
    icon: Fingerprint,
    title: "Encryption devices",
    text: "See every device on your account, its key fingerprint, and withdraw trust instantly.",
  },
  {
    icon: KeyRound,
    title: "Two-factor authentication",
    text: "Add an authenticator app and keep recovery codes for sign-in and sensitive actions.",
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
  "The first time you open Circlo on a device, it creates a long-term identity key pair locally. Only the public half is uploaded; the private half stays encrypted on that device.",
  "When you message someone, your device fetches their published prekeys and performs an X3DH key agreement, establishing a separate session for each of their approved devices.",
  "Your message is encrypted with a key derived for that message from the session chain before it leaves the device. Our servers receive ciphertext, and store ciphertext.",
  "The recipient's device derives the matching key and decrypts locally. Keys are never transmitted to us in a usable form.",
];

const NOT_COVERED = [
  "Your profile: display name, username, bio, avatar and links, which other people must be able to see.",
  "Group and community structure: names, avatars, membership, roles and admin settings.",
  "Status updates, which are stored in a readable form so they can be shown to your chosen audience and reviewed if reported.",
  "Conversation metadata: who is talking to whom, when, how often, and how large the messages are.",
  "Security and account data: sign-in history, device and browser labels, and approximate country.",
  "Anything you deliberately send to us, such as a report, a support message or a verification request.",
];

const USE = [
  "To provide the service: authenticating you, delivering messages to the right devices, syncing state, and showing your own data back to you.",
  "To keep it secure: rate limits, session management, same-origin request checks, device approval, and sign-in alerts.",
  "To prevent abuse: pattern-based signals such as sending rates, duplicate sends and reports, plus blocking. We cannot scan encrypted message content, and we do not try to.",
  "To support you: answering in-app support threads and resolving the account problems you raise.",
  "To meet legal obligations: responding to valid legal requests to the extent we are able, and keeping the audit records that make administrative actions accountable.",
];

const SAFEGUARDS = [
  "Transport is encrypted in transit with TLS, and HSTS and a strict content security policy are enforced on the app.",
  "Passwords are stored as bcrypt hashes with per-account salts; sign-in, reset and sensitive actions are rate-limited.",
  "Sessions use HTTP-only, secure, same-site cookies, and state-changing requests are checked for same-origin.",
  "Consequential actions — deleting your account, revoking devices, resetting encryption trust — require fresh authentication and, when enabled, a second factor.",
  "Media lives in a private store. Every read is authorized through the app, and encrypted attachments are served as ciphertext only.",
  "Uploads that are meant to be readable are validated, scanned where a scanner is configured, and re-encoded so embedded metadata and scripts are discarded.",
  "Trust changes are recorded: device approvals, revocations and key rotations are visible in your encryption settings and in the audit trail.",
  "We reduce exposure by default: previews, transcripts and search work from data decrypted on your own device rather than from a readable server copy.",
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
    text: "You can export your account information from your profile at any time, and download any single conversation as a JSON file. Encrypted messages are exported exactly as they are stored — as ciphertext — because the export runs on servers that cannot read them.",
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
    text: "Display name, username, email address, and anything optional you add such as a bio, avatar, phone number or links. Your password is stored only as a bcrypt hash with a per-account salt. We never store the password itself and we never email it to you.",
  },
  {
    lead: "Encrypted content.",
    text: "Message text, captions, edits, reactions, attachments and voice notes. All of it is sealed on your device and stored as ciphertext alongside the wrapped keys that only the intended devices can open.",
  },
  {
    lead: "Readable content you publish.",
    text: "Profile photos, group and community names and avatars, and status updates. These are processed and stored in a readable form because they have to be displayed to other people and can be reported.",
  },
  {
    lead: "Security and device data.",
    text: "Sign-in timestamps and outcomes, IP address, browser and device labels, an approximate country derived from the network, active sessions, and the public keys of your encryption devices.",
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
    text: "People in your conversations receive the content you send, and their devices do the decrypting. People who can see your profile see the fields and activity signals your privacy settings allow.",
  },
  {
    lead: "With the people who run Circlo.",
    text: "Administrators can see account records and conversation metadata, and can remove content that violates our terms — but what they remove is ciphertext they cannot read. Administrative actions require a fresh verification challenge and are written to an audit log.",
  },
  {
    lead: "Legal requests.",
    text: "If we receive a valid request, we can produce account records, metadata and stored ciphertext. We cannot produce readable message content, because we do not hold the keys, and we will not weaken encryption for anyone. Where we are permitted to, we will tell you about a request that concerns your account.",
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
        lead="Circlo is built so the content of your conversations belongs to you. Message text, attachments and voice notes are encrypted on your device before they reach us, and our servers store ciphertext they cannot read. This page explains what we collect, what we can and cannot see, and the controls you have."
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
          Encryption protects content. It does not hide the fact that two accounts exchanged messages, so we describe
          the metadata we handle separately, and honestly, in section 3.
        </p>
      </section>

      <LegalBody index={<LegalIndex entries={INDEX} />}>
        <LegalSection id="encryption" number="1" title="End-to-end encryption" icon={LockKeyhole}>
          <p>
            Every Circlo conversation is end-to-end encrypted following the design pioneered by the Signal protocol:
            X3DH key agreement to start a session, then a ratcheting session that advances as you talk. This is how the
            app works. There is no switch that turns it off, and a payload that is not encrypted is rejected by our
            servers.
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

          <h3 className="font-display pt-2 text-base font-semibold text-[var(--text)]">Group conversations</h3>
          <p>
            Group messages use a sender key that is distributed to each member&apos;s approved devices separately, and
            rotated when membership changes. Someone who joins later cannot read what was said before they arrived, and
            someone who leaves or is removed cannot read what is said afterwards.
          </p>

          <h3 className="font-display pt-2 text-base font-semibold text-[var(--text)]">
            Your devices and your keys
          </h3>
          <p>
            A browser or phone becomes trusted only when a device you already trust approves it, by proving possession
            of its private key. The approval screen shows the new device&apos;s key fingerprint so you can compare it,
            and revoking a device removes its trust immediately, so it stops receiving keys. We do hold an encrypted
            backup of your device key, so a returning browser can be restored — but the 32-byte secret that unlocks that
            backup is generated on your device and is never sent to us, which is why the backup is unreadable without
            it, including to us.
          </p>
          <LegalCallout>
            No one — not our engineers, not an administrator, not anyone with a court order — can read your encrypted
            conversations, because the keys needed to do so are never on our servers. The same fact has a hard edge: if
            you lose every trusted device and your recovery material, your earlier history cannot be recovered. We would
            rather say that plainly than offer a backdoor.
          </LegalCallout>

          <h3 className="font-display pt-2 text-base font-semibold text-[var(--text)]">
            What encryption does not cover
          </h3>
          <LegalChecklist items={NOT_COVERED} tone="note" />
          <p>
            Because we hold only ciphertext, we cannot build a searchable index of your conversations across the
            service, and notifications cannot show what a message said. A push notification tells you that a message
            arrived, not what it contains.
          </p>
          <p className="text-[13px] leading-6">
            <strong className="text-[var(--text)]">Verification.</strong> Our encryption design is documented in full,
            and the client is written so its cryptographic layer can be reviewed and replaced on its own. We have not yet
            published an independent third-party audit of that layer, and this page will say so plainly when we do.
          </p>
        </LegalSection>

        <LegalSection id="collect" number="2" title="Information we collect" icon={Database}>
          <p>We collect what a messaging service needs and no more, keeping content separate from metadata.</p>
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

        <LegalSection id="metadata" number="3" title="Metadata we handle" icon={ServerCog}>
          <p>
            Encrypting content does not erase the fact that it was sent. Our servers necessarily see the envelope: which
            accounts are in a conversation, when a message or reaction was written, its size and type, who has opened it,
            and which devices are online to receive it. Delivering messages needs that information, and abuse prevention
            relies on it.
          </p>
          <p>
            We use metadata to route messages, keep sessions and notifications working, rate-limit and block spam and
            abuse, and understand service health in aggregate. We do not sell it, and we do not use it to build
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
            Security is layered, and the encryption in section 1 is the outermost layer: the data most worth stealing is
            never stored in a form we could lose.
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
            Deleting your account removes your account data, the messages you sent and the encryption keys registered to
            you. It cannot remove a copy that another participant&apos;s device has already decrypted and stored locally,
            and we cannot recover anything once it is gone.
          </p>
        </LegalSection>

        <LegalSection id="transfers" number="10" title="Where data is processed" icon={Globe2}>
          <p>
            Circlo runs on the providers listed in section 5, in the United States and the European Union. Where personal
            data moves between regions we rely on appropriate safeguards such as standard contractual clauses, and each
            provider publishes its own transfer terms. To the extent we hold encrypted content at all, we hold ciphertext
            that cannot be read in any region.
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
          <p>
            Questions about this policy, your data or our encryption can be sent from inside Circlo, through the support
            and report options in your profile. Those messages create a record we can act on and audit. If you are making
            a data protection request, say so explicitly and we will answer through the same channel, so you have a
            written record of the exchange.
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
