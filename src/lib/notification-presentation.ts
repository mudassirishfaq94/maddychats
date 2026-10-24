/** One presentation for every delivery channel: browser worker, in-app alert and Android push. */
const BRAND = "· Circlo";
const MAX_TITLE_LENGTH = 80;
const MAX_BODY_LENGTH = 140;
/** Leaves room for the brand suffix so a truncated sender never eats it. */
const MAX_LABEL_LENGTH = MAX_TITLE_LENGTH - BRAND.length;

export interface NotificationPresentation {
  title: string;
  body: string;
}

export type NotificationMessageKind = "text" | "photo" | "video" | "voice" | "file";

function safeMessageFallback(kind: NotificationMessageKind): string {
  switch (kind) {
    case "photo": return "Sent you a photo. Open Circlo to view it.";
    case "video": return "Sent you a video. Open Circlo to watch it.";
    case "voice": return "Sent you a voice message. Open Circlo to listen.";
    case "file": return "Sent you a file. Open Circlo to view it.";
    default: return "Sent you a message. Open Circlo to read it.";
  }
}

function cleanText(value: string, fallback: string, maxLength: number): string {
  const normalized = value
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(normalized).slice(0, maxLength).join("") || fallback;
}

export function messageNotificationPresentation(input: {
  showDetails: boolean;
  messageRequest?: boolean;
  locked?: boolean;
  isGroup: boolean;
  groupName: string | null;
  actorName: string;
  preview: string;
  encrypted: boolean;
  messageKind?: NotificationMessageKind;
}): NotificationPresentation {
  if (input.locked) return { title: "Circlo", body: "Open Circlo to view your message." };
  if (input.messageRequest) return { title: "New Message Request", body: "You have received a new message request." };
  if (!input.showDetails) {
    return { title: "Circlo", body: "You have a new message. Open Circlo to read it." };
  }

  const actor = cleanText(input.actorName, "Someone", MAX_LABEL_LENGTH);
  const message = input.encrypted
    ? safeMessageFallback(input.messageKind ?? "text")
    : cleanText(input.preview, "New message. Open Circlo to read it.", MAX_BODY_LENGTH);

  return input.isGroup
    ? {
        title: `${cleanText(input.groupName ?? "", "Group chat", MAX_LABEL_LENGTH)} ${BRAND}`,
        body: cleanText(`${actor}: ${message}`, "New message. Open Circlo to read it.", MAX_BODY_LENGTH),
      }
    : { title: `${actor} ${BRAND}`, body: message };
}
