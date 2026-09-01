"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Reply,
  SmilePlus,
  Star,
  StarOff,
  Trash2,
} from "lucide-react";
import { REACTION_CHOICES } from "@/lib/schemas";
import { cn } from "@/lib/utils";

/**
 * Hover/tap action cluster for a message: Reply · React · Star · Pin · Copy · Delete.
 * Actions are gated by ownership and permissions.
 */
export function MessageActions({
  own,
  deleted,
  align,
  starred,
  pinned,
  onReply,
  onReact,
  onCopy,
  onEdit,
  onStar,
  onUnstar,
  onPin,
  onUnpin,
  onDeleteForMe,
  onDeleteForEveryone,
}: {
  own: boolean;
  deleted: boolean;
  align: "left" | "right";
  starred: boolean;
  pinned: boolean;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onCopy: () => void;
  onEdit: () => void;
  onStar: () => void;
  onUnstar: () => void;
  onPin: () => void;
  onUnpin: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPickerOpen(false);
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (deleted) return null;

  function handleCopy() {
    onCopy();
    setCopied(true);
    setMenuOpen(false);
    setTimeout(() => setCopied(false), 1400);
  }

  const iconBtn =
    "flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] transition-colors hover:text-[var(--text)]";

  return (
    <div
      ref={wrapRef}
      className={cn(
        "absolute top-1/2 z-20 flex -translate-y-1/2 items-center gap-1",
        "opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100",
        pickerOpen || menuOpen ? "opacity-100" : "",
        align === "right" ? "-left-[5.5rem]" : "-right-[5.5rem]",
      )}
    >
      <button type="button" aria-label="Reply" title="Reply" onClick={onReply} className={iconBtn}>
        <Reply className="h-3.5 w-3.5" />
      </button>

      <div className="relative">
        <button
          type="button"
          aria-label="Add reaction"
          title="React"
          onClick={() => {
            setPickerOpen((v) => !v);
            setMenuOpen(false);
          }}
          className={iconBtn}
        >
          <SmilePlus className="h-3.5 w-3.5" />
        </button>
        {pickerOpen ? (
          <div className="card-glass absolute bottom-[calc(100%+8px)] left-1/2 z-30 flex -translate-x-1/2 gap-0.5 rounded-2xl p-1.5 animate-fade-up">
            {REACTION_CHOICES.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`React ${emoji}`}
                onClick={() => {
                  onReact(emoji);
                  setPickerOpen(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-lg transition-transform duration-150 hover:scale-125 hover:bg-[color-mix(in_srgb,var(--muted)_12%,transparent)]"
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="relative">
        <button
          type="button"
          aria-label="More actions"
          title="More"
          onClick={() => {
            setMenuOpen((v) => !v);
            setPickerOpen(false);
          }}
          className={iconBtn}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-[var(--success)]" />
          ) : (
            <MoreHorizontal className="h-3.5 w-3.5" />
          )}
        </button>
        {menuOpen ? (
          <div
            className={cn(
              "card-glass absolute bottom-[calc(100%+8px)] z-30 w-44 rounded-2xl p-1 animate-fade-up",
              align === "right" ? "right-0" : "left-0",
            )}
          >
            <button
              type="button"
              onClick={() => {
                starred ? onUnstar() : onStar();
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs text-[var(--muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--muted)_10%,transparent)] hover:text-[var(--text)]"
            >
              {starred ? (
                <StarOff className="h-3.5 w-3.5" />
              ) : (
                <Star className="h-3.5 w-3.5" />
              )}
              {starred ? "Unstar" : "Star"}
            </button>

            <button
              type="button"
              onClick={() => {
                pinned ? onUnpin() : onPin();
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs text-[var(--muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--muted)_10%,transparent)] hover:text-[var(--text)]"
            >
              {pinned ? (
                <PinOff className="h-3.5 w-3.5" />
              ) : (
                <Pin className="h-3.5 w-3.5" />
              )}
              {pinned ? "Unpin" : "Pin"}
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs text-[var(--muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--muted)_10%,transparent)] hover:text-[var(--text)]"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy text
            </button>

            <div className="my-1 border-t border-[var(--border)]" />

            <button
              type="button"
              onClick={() => {
                onDeleteForMe();
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs text-[var(--muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:text-[var(--danger)]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete for me
            </button>

            {own ? (
              <button
                type="button"
                onClick={() => {
                  onDeleteForEveryone();
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs text-[var(--danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete for everyone
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
