"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

const WAVEFORM = [7, 12, 18, 10, 22, 15, 9, 19, 25, 13, 8, 17, 23, 14, 10, 20, 26, 16, 8, 13, 21, 11, 18, 24, 14, 9, 19, 12, 22, 16, 10, 17];

function finiteTime(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function formatDuration(seconds: number): string {
  const safeSeconds = finiteTime(seconds);
  const m = Math.floor(safeSeconds / 60);
  const s = Math.floor(safeSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioMessage({ src, own, duration: initialDuration }: { src: string; own: boolean; duration?: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const recoveringDurationRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(finiteTime(initialDuration ?? 0));

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const readDuration = () => {
      const nextDuration = finiteTime(audio.duration);
      if (nextDuration) {
        setDuration(nextDuration);
        if (recoveringDurationRef.current) {
          recoveringDurationRef.current = false;
          audio.currentTime = 0;
        }
      } else if (audio.duration === Infinity && !recoveringDurationRef.current) {
        // MediaRecorder WebM files may omit duration metadata. Seeking beyond
        // the end makes Chromium calculate the real duration.
        recoveringDurationRef.current = true;
        audio.currentTime = Number.MAX_SAFE_INTEGER;
      }
    };

    const onTimeUpdate = () => {
      if (!recoveringDurationRef.current) setCurrentTime(finiteTime(audio.currentTime));
      readDuration();
    };
    const onPlay = () => { setPlaying(true); };
    const onPause = () => { setPlaying(false); };
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
      audio.currentTime = 0;
    };

    audio.addEventListener("loadedmetadata", readDuration);
    audio.addEventListener("durationchange", readDuration);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("loadedmetadata", readDuration);
      audio.removeEventListener("durationchange", readDuration);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [src]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try { await audio.play(); } catch { setPlaying(false); }
  }, []);

  const seek = useCallback((value: number) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const nextTime = Math.min(duration, Math.max(0, value));
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, [duration]);

  const progress = duration ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="flex min-w-[250px] max-w-[340px] items-center gap-3 py-0.5">
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={() => void togglePlay()}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-sm transition-all hover:scale-105 active:scale-95",
          own ? "bg-white/20 text-white hover:bg-white/30" : "bg-[var(--accent)] text-white hover:brightness-110",
        )}
      >
        {playing ? <Pause className="h-4.5 w-4.5 fill-current" /> : <Play className="ml-0.5 h-4.5 w-4.5 fill-current" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="relative flex h-7 items-center gap-[2px]">
          {WAVEFORM.map((height, index) => (
            <span
              key={index}
              className={cn(
                "w-1 flex-1 rounded-full transition-colors",
                index / WAVEFORM.length <= progress / 100
                  ? own ? "bg-white" : "bg-[var(--accent)]"
                  : own ? "bg-white/35" : "bg-[var(--muted)]/35",
              )}
              style={{ height }}
            />
          ))}
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.05}
            value={Math.min(currentTime, duration || 0)}
            onChange={(event) => seek(Number(event.target.value))}
            aria-label="Seek voice message"
            disabled={!duration}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
          />
        </div>

        <div className="mt-0.5 flex items-center justify-between gap-3">
          <span className={cn("text-[0.68rem] tabular-nums", own ? "text-white/70" : "text-[var(--muted)]")}>
            {playing || currentTime > 0 ? `${formatDuration(currentTime)} / ${formatDuration(duration)}` : formatDuration(duration)}
          </span>
          <span className={cn("flex items-center gap-1 text-[0.62rem] font-medium uppercase tracking-wide", own ? "text-white/55" : "text-[var(--muted)]")}>
            <Mic2 className="h-3 w-3" /> Voice
          </span>
        </div>
      </div>
    </div>
  );
}
