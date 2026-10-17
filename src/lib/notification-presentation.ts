function cleanText(value: string, fallback: string, maxLength: number): string {
  const normalized = value
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(normalized).slice(0, maxLength).join("") || fallback;
}

export function messageNotificationPresentation(input: {
  showDetails: boolean;
  isGroup: boolean;
  groupName: string | null;
  actorName: string;
  preview: string;
  encrypted: boolean;
}) {
  if (!input.showDetails) {
    return { title: "Circlo", body: "New message. Open Circlo to read it." };
  }

  const actor = cleanText(input.actorName, "Someone", 80);
  const message = input.encrypted
    ? "New encrypted message. Open Circlo to read it."
    : cleanText(input.preview, "New message. Open Circlo to read it.", 140);

  return input.isGroup
    ? { title: `${cleanText(input.groupName ?? "", "Group chat", 80)} · Circlo`, body: `${actor}: ${message}` }
    : { title: `${actor} · Circlo`, body: message };
}
