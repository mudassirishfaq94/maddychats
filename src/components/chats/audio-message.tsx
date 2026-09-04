"use client";

import { Mic2, Pause, Play, Captions, Loader2 } from "lucide-react";
import { useState } from "react";
import type { PublicUser } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { Waveform } from "./waveform";
import { useVoicePlayback } from "@/hooks/use-audio-player";
import { cn } from "@/lib/utils";

function finiteTime(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function formatDuration(seconds: number): string {
  const s = finiteTime(seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function AudioMessage({
  src,
  own,
  duration: initialDuration,
  sender,
  transcript: initialTranscript,
  attachmentId,
}: {
  src: string;
  own: boolean;
  duration?: number;
  sender?: PublicUser;
  transcript?: string | null;
  attachmentId?: string;
}) {
  const voiceId = `voice-${src}`;
  const {
    playing,
    currentTime,
    duration,
    loading,
    error,
    togglePlay,
    seek,
    playbackRate,
    cyclePlaybackRate,
  } = useVoicePlayback(voiceId, src);

  const totalDuration = duration || finiteTime(initialDuration ?? 0);
  const progress = totalDuration ? (currentTime / totalDuration) * 100 : 0;
  const [transcript, setTranscript] = useState(initialTranscript ?? null);
  const [transcribing, setTranscribing] = useState(false);

  if (error) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl px-4 py-3",
          own
            ? "rounded-br-md text-white/70"
            : "rounded-bl-md border border-[var(--border)] bg-[var(--bubble-other-bg)]",
        )}
        style={own ? { background: "var(--bubble-own-bg)" } : undefined}
      >
        <Mic2 className="h-4 w-4 opacity-50" />
        <span className="text-xs opacity-70">Voice message unavailable</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-end gap-2",
        own ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* Avatar */}
      {sender && (
        <span className="mb-0.5 shrink-0">
          <Avatar user={sender} size={28} />
        </span>
      )}

      {/* Voice bubble */}
      <div
        className={cn(
          "flex max-w-[300px] min-w-[220px] items-center gap-3 rounded-2xl px-3 py-2.5",
          own
            ? "rounded-br-md"
            : "rounded-bl-md border border-[var(--border)] bg-[var(--bubble-other-bg)]",
        )}
        style={own ? { background: "var(--bubble-own-bg)" } : undefined}
      >
        {/* Play/Pause button */}
        <button
          type="button"
          onClick={() => void togglePlay()}
          aria-label={playing ? "Pause" : "Play"}
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm transition-all active:scale-95",
            own
              ? "bg-white/20 text-white hover:bg-white/30"
              : "bg-[var(--accent)] text-white hover:brightness-110",
          )}
        >
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : playing ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="ml-0.5 h-4 w-4 fill-current" />
          )}
        </button>

        {/* Waveform + time */}
        <div className="min-w-0 flex-1">
          <Waveform
            src={src}
            progress={progress}
            playing={playing}
            own={own}
            onSeek={totalDuration ? (fraction) => seek(fraction * totalDuration) : undefined}
            height={28}
            loading={loading}
          />

          <div className="mt-1 flex items-center justify-between">
            <button
              type="button"
              onClick={cyclePlaybackRate}
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold tabular-nums transition-colors",
                own ? "bg-white/15 text-white/80 hover:bg-white/25" : "bg-[var(--accent-soft)] text-[var(--accent-fg)]",
              )}
              aria-label={`Playback speed ${playbackRate} times. Change speed`}
              title="Change playback speed"
            >
              {playbackRate}×
            </button>
            <span
              className={cn(
                "text-[0.65rem] tabular-nums",
                own ? "text-white/60" : "text-[var(--muted)]",
              )}
            >
              {playing || currentTime > 0
                ? `${formatDuration(currentTime)} / ${formatDuration(totalDuration)}`
                : formatDuration(totalDuration)}
            </span>
            <span
              className={cn(
                "flex items-center gap-1 text-[0.6rem] font-medium uppercase tracking-wide",
                own ? "text-white/45" : "text-[var(--muted)]",
              )}
            >
              <Mic2 className="h-2.5 w-2.5" />
              Voice
            </span>
          </div>

          {/* Transcript */}
          {transcript ? (
            <p className={cn(
              "mt-2 border-t pt-2 text-[0.75rem] leading-relaxed",
              own ? "border-white/15 text-white/70" : "border-[var(--border)] text-[var(--muted)]",
            )}>
              {transcript}
            </p>
          ) : attachmentId ? (
            <button
              type="button"
              onClick={async () => {
                setTranscribing(true);
                try {
                  const res = await fetch(`/api/messages/transcribe`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ attachmentId, audioUrl: src }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    setTranscript(data.transcript);
                  }
                } catch {}
                setTranscribing(false);
              }}
              disabled={transcribing}
              className={cn(
                "mt-2 flex items-center gap-1.5 border-t pt-2 text-[0.65rem] font-medium transition-colors",
                own ? "border-white/15 text-white/50 hover:text-white/70" : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]",
              )}
            >
              {transcribing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Captions className="h-3 w-3" />}
              {transcribing ? "Transcribing..." : "Show transcript"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
