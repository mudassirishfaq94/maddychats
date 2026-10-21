/** First-party, versioned artwork: no external catalog, tracking pixels or API keys. */
export const ANIMATED_MEDIA = [
  { id: "hello", label: "Hello", tags: "wave hi welcome greeting" },
  { id: "love", label: "Love", tags: "heart thanks hug affection" },
  { id: "laugh", label: "Laugh", tags: "happy funny haha smile" },
  { id: "celebrate", label: "Celebrate", tags: "party congratulations yay confetti" },
  { id: "yes", label: "Yes", tags: "agree okay success check done" },
  { id: "busy", label: "Busy", tags: "wait working thinking coffee" },
] as const;
export const GIF_MEDIA = [
  { id: "orbit", label: "Hey there", tags: "hello wave astronaut space greeting" },
  { id: "cozy", label: "Cozy vibes", tags: "cat coffee love relax warmth" },
  { id: "plot-twist", label: "Plot twist", tags: "popcorn drama funny laugh watching" },
  { id: "big-win", label: "Big win", tags: "trophy celebrate congratulations success" },
  { id: "on-my-way", label: "On my way", tags: "rocket go travel yes coming" },
  { id: "recharge", label: "Recharge", tags: "moon cloud sleepy busy rest night" },
] as const;
export function animatedMediaCatalog(gif = false) { return gif ? GIF_MEDIA : ANIMATED_MEDIA; }
export function animatedMediaUrl(id: string, gif = false) {
  if (!animatedMediaCatalog(gif).some(item => item.id === id)) throw new Error("Unknown animated artwork");
  return `/${gif ? "gifs" : "stickers"}/circlo-${id}-${gif ? "v2" : "v1"}.${gif ? "gif" : "webp"}`;
}
export function animatedMediaPosterUrl(id: string, gif = false) { return animatedMediaUrl(id, gif).replace(/\.(gif|webp)$/, ".png"); }
/** Smaller previews; original upload formats remain compatible with existing messages. */
export function animatedMediaPreviewUrl(id: string, gif = false) { return animatedMediaUrl(id, gif).replace(/\.gif$/, ".webp"); }
