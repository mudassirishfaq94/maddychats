/** Counts emoji graphemes, including skin tones, flags and joined families. */
export function emojiOnlyCount(text: string): number {
  const value = text.trim();
  if (!value || value.length > 128) return 0;
  const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)];
  const emoji = /^(?:\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}[\uFE0F\p{Emoji_Modifier}]*(?:\u200D\p{Extended_Pictographic}[\uFE0F\p{Emoji_Modifier}]*)*)$/u;
  const visible = segments.map(part => part.segment).filter(part => part.trim());
  return visible.length <= 3 && visible.every(part => emoji.test(part)) ? visible.length : 0;
}
