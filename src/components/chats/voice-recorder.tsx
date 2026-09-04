"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { Lock, Trash2, Pause, Play, Send, StopCircle, Loader2 } from "lucide-react";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { AudioMessage } from "./audio-message";
import type { SafeUser } from "@/lib/types";
import { cn } from "@/lib/utils";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface VoiceRecorderUIProps {
  me: SafeUser;
  onSend: () => void;
  sending: boolean;
}

/**
 * Voice recorder UI with:
 * - Hold-to-record
 * - Slide up to lock (one-handed)
 * - Pause/Resume
 * - Preview before sending
 * - Cancel
 */
export function VoiceRecorderUI({ me, onSend, sending }: VoiceRecorderUIProps) {
  const recorder = useVoiceRecorder();
  const [locked, setLocked] = useState(false);
  const lockThresholdRef = useRef(0);
  const startYRef = useRef(0);
  const isDraggingRef = useRef(false);

  const startRef = useCallback((y: number) => {
    startYRef.current = y;
    isDraggingRef.current = false;
    lockThresholdRef.current = 0;
  }, []);

  const moveRef = useCallback((y: number) => {
    if (!isDraggingRef.current) {
      isDraggingRef.current = Math.abs(y - startYRef.current) > 15;
    }
    if (!isDraggingRef.current) return;

    const delta = startYRef.current - y; // positive = swiping up
    if (delta > 60 && recorder.state === "recording") {
      setLocked(true);
      recorder.pauseRecording();
    }
  }, [recorder]);

  const endRef = useCallback(() => {
    isDraggingRef.current = false;
    // If not locked and was a short tap, do nothing (the mic button handles it)
  }, []);

  useEffect(() => {
    if (recorder.state === "idle") {
      setLocked(false);
    }
  }, [recorder.state]);

  if (recorder.state === "idle") return null;

  return (
    <div className="mb-2">
      {recorder.state === "recorded" ? (
        /* -------- Preview before sending -------- */
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-2)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <AudioMessage
              src={recorder.audioUrl ?? ""}
              own={true}
              sender={me}
              duration={recorder.duration}
            />
          </div>
          <button
            type="button"
            onClick={() => recorder.clearRecording()}
            className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm text-[var(--muted)] hover:bg-[var(--surface-2)]"
            aria-label="Delete recording"
          >
            <Trash2 className="h-4 w-4" />
            <span className="hidden sm:inline">Delete</span>
          </button>
          <button
            type="button"
            onClick={onSend}
            disabled={sending}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)] text-white transition-transform active:scale-95"
            aria-label="Send voice message"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      ) : locked ? (
        /* -------- Locked recording (one-handed mode) -------- */
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-2)] px-4 py-4">
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <Lock className="h-3 w-3" />
            <span>Recording locked</span>
          </div>

          {/* Live duration */}
          <div className="text-2xl font-bold tabular-nums">
            {formatDuration(recorder.duration)}
          </div>

          {/* Animated recording indicator */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className="h-4 w-1 rounded-full bg-[var(--danger)] animate-pulse"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                recorder.cancelRecording();
                setLocked(false);
              }}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-2)]"
              aria-label="Cancel recording"
            >
              <Trash2 className="h-4 w-4" />
            </button>

            {recorder.state === "recording" ? (
              <button
                type="button"
                onClick={() => recorder.pauseRecording()}
                className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)]"
                aria-label="Pause recording"
              >
                <Pause className="h-5 w-5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => recorder.resumeRecording()}
                className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-fg)] hover:bg-[var(--accent)]"
                aria-label="Resume recording"
              >
                <Play className="h-5 w-5 fill-current" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                recorder.stopRecording();
                setLocked(false);
              }}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--danger)] text-white transition-transform active:scale-95"
              aria-label="Stop recording"
            >
              <StopCircle className="h-5 w-5" />
            </button>
          </div>
        </div>
      ) : (
        /* -------- Active recording (not locked) -------- */
        <div
          className="relative flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-2)] px-4 py-3 select-none"
          onTouchStart={(e) => startRef(e.touches[0].clientY)}
          onTouchMove={(e) => moveRef(e.touches[0].clientY)}
          onTouchEnd={endRef}
        >
          <span
            className={cn(
              "flex h-3 w-3 rounded-full bg-red-500",
              recorder.state === "recording" && "animate-pulse",
            )}
          />
          <span className="text-sm font-medium tabular-nums">
            {formatDuration(recorder.duration)}
          </span>

          <div className="min-w-0 flex-1" />

          {/* Cancel */}
          <button
            type="button"
            onClick={() => {
              recorder.cancelRecording();
              setLocked(false);
            }}
            className="flex h-11 min-w-[44px] items-center justify-center rounded-xl text-[var(--muted)] hover:bg-[var(--surface-2)]"
            aria-label="Cancel recording"
          >
            <Trash2 className="h-4 w-4" />
          </button>

          {/* Pause */}
          <button
            type="button"
            onClick={() => recorder.pauseRecording()}
            className="flex h-11 min-w-[44px] items-center justify-center rounded-full border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)]"
            aria-label="Pause recording"
          >
            {recorder.state === "recording" ? (
              <Pause className="h-4 w-4 fill-current" />
            ) : (
              <Play className="h-4 w-4 fill-current" />
            )}
          </button>

          {/* Stop */}
          <button
            type="button"
            onClick={() => {
              recorder.stopRecording();
              setLocked(false);
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--danger)] text-white transition-transform active:scale-95"
            aria-label="Stop recording"
          >
            <StopCircle className="h-5 w-5" />
          </button>

          {/* Lock hint (swipe up) */}
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5 text-[0.6rem] text-[var(--muted)]">
            <Lock className="h-3 w-3" />
            <span>↑ Lock</span>
          </div>
        </div>
      )}

      {/* Error */}
      {recorder.error ? (
        <div className="mt-1.5 rounded-xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2">
          <p className="whitespace-pre-line text-xs leading-relaxed text-[var(--danger)]">
            {recorder.error}
          </p>
        </div>
      ) : null}
    </div>
  );
}
