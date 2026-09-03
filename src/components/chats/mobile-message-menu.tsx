"use client";

import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Forward,
  Reply,
  SmilePlus,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { REACTION_CHOICES } from "@/lib/schemas";
import { cn } from "@/lib/utils";

interface MobileMessageMenuProps {
  open: boolean;
  onClose: () => void;
  /** Whether the message is owned by the current user */
  own: boolean;
  /** Message text for copy */
  text: string;
  onCopy: () => void;
  onReply: () => void;
  onForward: () => void;
  onReact: (emoji: string) => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
}

/**
 * Full-screen mobile context menu triggered by long-press.
 * Shows Copy, Reply, Forward, React, Delete with a backdrop.
 */
export function MobileMessageMenu({
  open,
  onClose,
  own,
  text,
  onCopy,
  onReply,
  onForward,
  onReact,
  onDeleteForMe,
  onDeleteForEveryone,
}: MobileMessageMenuProps) {
  const [showReactions, setShowReactions] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setShowReactions(false);
      setShowDeleteConfirm(false);
      setCopied(false);
    }
  }, [open]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  function handleCopy() {
    onCopy();
    setCopied(true);
    setTimeout(() => {
      onClose();
    }, 800);
  }

  function handleReact(emoji: string) {
    onReact(emoji);
    onClose();
  }

  function handleDeleteForMe() {
    onDeleteForMe();
    onClose();
  }

  function handleDeleteForEveryone() {
    onDeleteForEveryone();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      />

      {/* Menu */}
      <div
        ref={menuRef}
        className="relative w-full max-w-lg rounded-t-3xl bg-[var(--surface)] px-2 pb-[env(safe-area-inset-bottom)] pt-3 shadow-2xl animate-slide-up"
      >
        {/* Drag handle */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--muted)] opacity-40" />

        {showDeleteConfirm ? (
          /* Delete confirmation */
          <div className="px-3 pb-4">
            <p className="mb-3 text-center text-sm font-medium">
              Delete this message?
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleDeleteForMe}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] py-3 text-sm font-medium transition-colors hover:bg-[color-mix(in_srgb,var(--muted)_12%,transparent)]"
              >
                <Trash2 className="h-4 w-4" />
                Delete for me
              </button>
              {own && (
                <button
                  type="button"
                  onClick={handleDeleteForEveryone}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] py-3 text-sm font-medium text-[var(--danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)]"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete for everyone
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex w-full items-center justify-center rounded-2xl py-3 text-sm font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : showReactions ? (
          /* Reaction picker */
          <div className="px-3 pb-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium">React</span>
              <button
                type="button"
                onClick={() => setShowReactions(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {REACTION_CHOICES.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleReact(emoji)}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl transition-transform active:scale-110"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Main action menu */
          <div className="px-3 pb-4">
            {/* Action buttons */}
            <div className="grid grid-cols-5 gap-2">
              {/* Copy */}
              <button
                type="button"
                onClick={handleCopy}
                className="flex flex-col items-center gap-1.5 rounded-2xl py-3 transition-colors hover:bg-[var(--surface-2)]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-2)]">
                  {copied ? (
                    <Check className="h-5 w-5 text-green-500" />
                  ) : (
                    <Copy className="h-5 w-5 text-[var(--muted)]" />
                  )}
                </span>
                <span className="text-[0.65rem] font-medium text-[var(--muted)]">
                  {copied ? "Copied!" : "Copy"}
                </span>
              </button>

              {/* Reply */}
              <button
                type="button"
                onClick={() => {
                  onReply();
                  onClose();
                }}
                className="flex flex-col items-center gap-1.5 rounded-2xl py-3 transition-colors hover:bg-[var(--surface-2)]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-2)]">
                  <Reply className="h-5 w-5 text-[var(--muted)]" />
                </span>
                <span className="text-[0.65rem] font-medium text-[var(--muted)]">
                  Reply
                </span>
              </button>

              {/* Forward */}
              <button
                type="button"
                onClick={() => {
                  onForward();
                  onClose();
                }}
                className="flex flex-col items-center gap-1.5 rounded-2xl py-3 transition-colors hover:bg-[var(--surface-2)]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-2)]">
                  <Forward className="h-5 w-5 text-[var(--muted)]" />
                </span>
                <span className="text-[0.65rem] font-medium text-[var(--muted)]">
                  Forward
                </span>
              </button>

              {/* React */}
              <button
                type="button"
                onClick={() => setShowReactions(true)}
                className="flex flex-col items-center gap-1.5 rounded-2xl py-3 transition-colors hover:bg-[var(--surface-2)]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-2)]">
                  <SmilePlus className="h-5 w-5 text-[var(--muted)]" />
                </span>
                <span className="text-[0.65rem] font-medium text-[var(--muted)]">
                  React
                </span>
              </button>

              {/* Delete */}
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="flex flex-col items-center gap-1.5 rounded-2xl py-3 transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_8%,transparent)]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]">
                  <Trash2 className="h-5 w-5 text-[var(--danger)]" />
                </span>
                <span className="text-[0.65rem] font-medium text-[var(--danger)]">
                  Delete
                </span>
              </button>
            </div>

            {/* Cancel button */}
            <button
              type="button"
              onClick={onClose}
              className="mt-2 flex w-full items-center justify-center rounded-2xl py-3 text-sm font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)]"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
