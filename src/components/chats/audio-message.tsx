"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioMessage({
  src,
  own,
  duration: initialDuration,
}: {
  src: string;
  own: boolean;
  duration?: number;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(initialDuration ?? 0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function onTimeUpdate() {
      if (audio && audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    }
    function onLoadedMetadata() {
      if (audio) setDuration(audio.duration);
    }
    function onEnded() {
      setPlaying(false);
      setProgress(0);
    }

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
    setPlaying(!playing);
  }, [playing]);

  return (
    <div className="flex items-center gap-3 min-w-[200px]">
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />

      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "Pause" : "Play"}
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
          own
            ? "bg-white/20 text-white hover:bg-white/30"
            : "bg-[var(--accent-soft)] text-[var(--accent-fg)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]",
        )}
      >
        {playing ? (
          <Pause className="h-4 w-4 fill-current" />
        ) : (
          <Play className="ml-0.5 h-4 w-4 fill-current" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        {/* Progress bar */}
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_15%,transparent)]">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-100"
            style={{
              width: `${progress}%`,
              background: own ? "rgba(255,255,255,0.7)" : "var(--accent)",
            }}
          />
        </div>

        {/* Duration */}
        <div className="mt-1 flex items-center justify-between">
          <span
            className={cn(
              "text-[0.65rem] tabular-nums",
              own ? "text-white/60" : "text-[var(--muted)]",
            )}
          >
            {formatDuration(duration)}
          </span>
          {playing && (
            <span className="flex gap-0.5">
              {[1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={cn(
                    "inline-block w-0.5 rounded-full",
                    own ? "bg-white/50" : "bg-[var(--accent)]",
                  )}
                  style={{
                    height: `${8 + Math.random() * 8}px`,
                    animation: `pulse 0.${4 + i}s ease-in-out infinite alternate`,
                  }}
                />
              ))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
