"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const EMOJI_CATEGORIES = [
  {
    id: "smileys",
    label: "😀",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "😊",
      "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "🥲", "😋",
      "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🫢", "🫣", "🤫",
      "🤔", "🫡", "🤐", "🤨", "😐", "😑", "😶", "🫥", "😏", "😒",
      "🙄", "😬", "🤥", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒",
      "🤕", "🤢", "🤮", "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳",
      "🥸", "😎", "🤓", "🧐", "😕", "🫤", "😟", "🙁", "😮", "😯",
      "😲", "😳", "🥺", "🥹", "😦", "😧", "😨", "😰", "😥", "😢",
      "😭", "😱", "😖", "😣", "😞", "😓", "😩", "😫", "🥱", "😤",
      "😡", "😠", "🤬", "😈", "👿", "💀", "☠️", "💩", "🤡", "👹",
    ],
  },
  {
    id: "gestures",
    label: "👋",
    emojis: [
      "👋", "🤚", "🖐️", "✋", "🖖", "🫱", "🫲", "🫳", "🫴", "👌",
      "🤌", "🤏", "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👈", "👉",
      "👆", "🖕", "👇", "☝️", "🫵", "👍", "👎", "✊", "👊", "🤛",
      "🤜", "👏", "🙌", "🫶", "👐", "🤲", "🤝", "🙏", "✍️", "💪",
      "🦾", "🦿", "🦵", "🦶", "👂", "🦻", "👃", "🧠", "🫀", "🦷",
    ],
  },
  {
    id: "animals",
    label: "🐶",
    emojis: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐻‍❄️", "🐨",
      "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🙈", "🙉", "🙊", "🐒",
      "🐔", "🐧", "🐦", "🐤", "🐣", "🐥", "🦆", "🦅", "🦉", "🦇",
      "🐺", "🐗", "🐴", "🦄", "🐝", "🪱", "🐛", "🦋", "🐌", "🐞",
      "🐜", "🪰", "🪲", "🪳", "🦟", "🦗", "🕷️", "🦂", "🐢", "🐍",
    ],
  },
  {
    id: "food",
    label: "🍕",
    emojis: [
      "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈",
      "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", "🫛",
      "🥦", "🥬", "🥒", "🌶️", "🫑", "🌽", "🥕", "🫒", "🧄", "🧅",
      "🥔", "🍠", "🫘", "🥐", "🍞", "🥖", "🥨", "🧀", "🥚", "🍳",
      "🧈", "🥞", "🧇", "🥓", "🥩", "🍗", "🍖", "🦴", "🌭", "🍔",
      "🍟", "🍕", "🫓", "🥪", "🥙", "🧆", "🌮", "🌯", "🫔", "🥗",
    ],
  },
  {
    id: "objects",
    label: "💡",
    emojis: [
      "⌚", "📱", "📲", "💻", "⌨️", "🖥️", "🖨️", "🖱️", "🖲️", "🕹️",
      "🗜️", "💽", "💾", "💿", "📀", "📼", "📷", "📸", "📹", "🎥",
      "📽️", "🎞️", "📞", "☎️", "📟", "📠", "📺", "📻", "🎙️", "🎚️",
      "🎛️", "🧭", "⏱️", "⏲️", "⏰", "🕰️", "⌛", "⏳", "📡", "🔋",
      "🪫", "🔌", "💡", "🔦", "🕯️", "🪔", "🧯", "🛢️", "💰", "🪙",
    ],
  },
  {
    id: "symbols",
    label: "❤️",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
      "❤️‍🔥", "❤️‍🩹", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝",
      "💟", "☮️", "✝️", "☪️", "🕉️", "☸️", "✡️", "🔯", "🕎", "☯️",
      "☦️", "🛐", "⛎", "♈", "♉", "♊", "♋", "♌", "♍", "♎",
      "♏", "♐", "♑", "♒", "♓", "🆔", "⚛️", "🉑", "☢️", "☣️",
    ],
  },
  {
    id: "flags",
    label: "🏁",
    emojis: [
      "🏁", "🚩", "🎌", "🏴", "🏳️", "🏳️‍🌈", "🏳️‍⚧️", "🏴‍☠️", "🇺🇸", "🇬🇧",
      "🇫🇷", "🇩🇪", "🇮🇹", "🇪🇸", "🇵🇹", "🇧🇷", "🇯🇵", "🇰🇷", "🇨🇳", "🇮🇳",
      "🇷🇺", "🇨🇦", "🇦🇺", "🇲🇽", "🇦🇷", "🇹🇷", "🇸🇦", "🇦🇪", "🇿🇦", "🇳🇬",
      "🇰🇪", "🇪🇬", "🇮🇩", "🇹🇭", "🇻🇳", "🇵🇭", "🇲🇾", "🇸🇬", "🇳🇿", "🇨🇭",
    ],
  },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState("smileys");
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const handleSelect = useCallback(
    (emoji: string) => {
      onSelect(emoji);
      onClose();
    },
    [onSelect, onClose],
  );

  const categories = search
    ? [
        {
          id: "search",
          label: "🔍",
          emojis: EMOJI_CATEGORIES.flatMap((c) => c.emojis).filter(() => true), // show all when searching
        },
      ]
    : EMOJI_CATEGORIES;

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 z-50 mb-2 w-[min(320px,calc(100vw-1rem))] rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl animate-fade-up"
      role="dialog"
      aria-label="Emoji picker"
    >
      {/* Search */}
      <div className="border-b border-[var(--border)] p-2">
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search emoji…"
          className="w-full rounded-xl bg-[var(--input-bg)] px-3 py-2 text-sm outline-none placeholder:text-[var(--muted)]"
        />
      </div>

      {/* Category tabs */}
      <div className="flex border-b border-[var(--border)] px-1 py-1">
        {EMOJI_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => {
              setActiveCategory(cat.id);
              setSearch("");
            }}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg text-base transition-colors",
              activeCategory === cat.id && !search
                ? "bg-[var(--surface-2)]"
                : "hover:bg-[var(--surface-2)]",
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Emoji grid */}
      <div className="max-h-[240px] overflow-y-auto p-2">
        {search ? (
          <div className="grid grid-cols-8 gap-0.5">
            {EMOJI_CATEGORIES.flatMap((c) => c.emojis)
              .slice(0, 64)
              .map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleSelect(emoji)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-xl transition-colors hover:bg-[var(--surface-2)]"
                >
                  {emoji}
                </button>
              ))}
          </div>
        ) : (
          categories.map((cat) => (
            <div key={cat.id}>
              <p className="mb-1 px-1 text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--muted)]">
                {cat.label} {cat.id}
              </p>
              <div className="grid grid-cols-8 gap-0.5">
                {cat.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleSelect(emoji)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-xl transition-colors hover:bg-[var(--surface-2)]"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
