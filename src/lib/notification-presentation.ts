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
}): NotificationPresentation {
  if (input.locked) return { title: "Circlo", body: "New message received." };
  if (input.messageRequest) return { title: "New Message Request", body: "You have received a new message request." };
  if (!input.showDetails) {
    return { title: "Circlo", body: "New message. Open Circlo to read it." };
  }

  const actor = cleanText(input.actorName, "Someone", MAX_LABEL_LENGTH);
  const message = input.encrypted
    ? "New encrypted message. Open Circlo to read it."
    : cleanText(input.preview, "New message. Open Circlo to read it.", MAX_BODY_LENGTH);

  return input.isGroup
    ? {
        title: `${cleanText(input.groupName ?? "", "Group chat", MAX_LABEL_LENGTH)} ${BRAND}`,
        body: cleanText(`${actor}: ${message}`, "New message. Open Circlo to read it.", MAX_BODY_LENGTH),
      }
    : { title: `${actor} ${BRAND}`, body: message };
}
