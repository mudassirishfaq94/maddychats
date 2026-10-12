/** First-party, versioned artwork: no external catalog, tracking pixels or API keys. */
export const ANIMATED_MEDIA = [
  { id: "hello", label: "Hello", tags: "wave hi welcome greeting" },
  { id: "love", label: "Love", tags: "heart thanks hug affection" },
  { id: "laugh", label: "Laugh", tags: "happy funny haha smile" },
  { id: "celebrate", label: "Celebrate", tags: "party congratulations yay confetti" },
  { id: "yes", label: "Yes", tags: "agree okay success check done" },
  { id: "busy", label: "Busy", tags: "wait working thinking coffee" },
] as const;
export function animatedMediaUrl(id: string, gif = false) {
  if (!ANIMATED_MEDIA.some(item => item.id === id)) throw new Error("Unknown animated artwork");
  return `/${gif ? "gifs" : "stickers"}/circlo-${id}-v1.${gif ? "gif" : "webp"}`;
}
