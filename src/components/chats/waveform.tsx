"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const BAR_COUNT = 32;
const BAR_GAP = 2;

/**
 * Generates waveform bar heights from an audio blob using Web Audio API.
 * Falls back to random-looking waveform if Web Audio API is unavailable.
 */
async function generateWaveformFromBlob(blob: Blob): Promise<number[]> {
  try {
    const ctx = new AudioContext();
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    const blockSize = Math.floor(channelData.length / BAR_COUNT);
    const bars: number[] = [];

    for (let i = 0; i < BAR_COUNT; i++) {
      let sum = 0;
      const start = i * blockSize;
      for (let j = start; j < start + blockSize && j < channelData.length; j++) {
        sum += Math.abs(channelData[j]);
      }
      bars.push(sum / blockSize);
    }

    // Normalize to 0-1
    const max = Math.max(...bars, 0.01);
    const normalized = bars.map((b) => b / max);

    ctx.close();
    return normalized;
  } catch {
    // Fallback: generate a pseudo-random waveform
    return Array.from({ length: BAR_COUNT }, (_, i) => {
      const x = i / BAR_COUNT;
      return 0.3 + 0.7 * Math.abs(Math.sin(x * 7 + 1.3) * Math.cos(x * 3.7));
    });
  }
}

/**
 * Generates waveform from a URL by fetching the audio.
 */
async function generateWaveformFromUrl(url: string): Promise<number[]> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return generateWaveformFromBlob(blob);
  } catch {
    return Array.from({ length: BAR_COUNT }, (_, i) => {
      const x = i / BAR_COUNT;
      return 0.3 + 0.7 * Math.abs(Math.sin(x * 7 + 1.3) * Math.cos(x * 3.7));
    });
  }
}

interface WaveformProps {
  /** Audio source - either a URL or Blob */
  src?: string;
  blob?: Blob;
  /** Current playback progress 0-100 */
  progress: number;
  /** Whether currently playing */
  playing: boolean;
  /** Whether this is the user's own message */
  own: boolean;
  /** Callback when user taps/clicks a position on the waveform */
  onSeek?: (fraction: number) => void;
  /** Height of the waveform in pixels */
  height?: number;
  /** Number of bars */
  bars?: number;
  /** Whether the audio is still loading */
  loading?: boolean;
  className?: string;
}

export function Waveform({
  src,
  blob,
  progress,
  playing,
  own,
  onSeek,
  height = 28,
  bars = BAR_COUNT,
  loading,
  className,
}: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [waveform, setWaveform] = useState<number[]>(() =>
    Array.from({ length: bars }, (_, i) => {
      const x = i / bars;
      return 0.3 + 0.7 * Math.abs(Math.sin(x * 7 + 1.3) * Math.cos(x * 3.7));
    }),
  );

  // Generate real waveform from audio
  useEffect(() => {
    if (blob) {
      generateWaveformFromBlob(blob).then(setWaveform);
    } else if (src) {
      generateWaveformFromUrl(src).then(setWaveform);
    }
  }, [src, blob]);

  const handleClick = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!onSeek || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX : e.clientX;
      const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onSeek(fraction);
    },
    [onSeek],
  );

  const playedIndex = Math.floor((progress / 100) * bars);

  return (
    <div
      ref={containerRef}
      className={cn("flex items-center gap-[2px]", className)}
      style={{ height }}
      onClick={handleClick}
      onTouchEnd={handleClick}
      role={onSeek ? "slider" : undefined}
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {waveform.slice(0, bars).map((height_fraction, i) => {
        const barHeight = Math.max(3, height_fraction * height);
        const isPlayed = i < playedIndex;
        return (
          <span
            key={i}
            className={cn(
              "rounded-full transition-[background-color] duration-100",
              isPlayed
                ? own
                  ? "bg-white"
                  : "bg-[var(--accent)]"
                : own
                  ? "bg-white/30"
                  : "bg-[color-mix(in_srgb,var(--muted)_40%,transparent)]",
            )}
            style={{
              width: `${Math.max(2, (100 / bars) - BAR_GAP / bars)}%`,
              height: barHeight,
              minWidth: 2,
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * Animated waveform for the recording state — shows live audio levels.
 */
export function RecordingWaveform({
  active,
  height = 28,
  className,
}: {
  active: boolean;
  height?: number;
  className?: string;
}) {
  const [levels, setLevels] = useState(() =>
    Array.from({ length: BAR_COUNT }, () => 0.3),
  );

  useEffect(() => {
    if (!active) return;
    let frame: number;
    const animate = () => {
      setLevels((prev) =>
        prev.map((_, i) => {
          const base = 0.2 + 0.3 * Math.sin(Date.now() / 300 + i * 0.5);
          const noise = Math.random() * 0.3;
          return Math.min(1, base + noise);
        }),
      );
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return (
    <div className={cn("flex items-center gap-[2px]", className)} style={{ height }}>
      {levels.map((level, i) => (
        <span
          key={i}
          className="rounded-full bg-red-400 transition-[height] duration-75"
          style={{
            width: `${Math.max(2, (100 / BAR_COUNT) - BAR_GAP / BAR_COUNT)}%`,
            height: Math.max(3, level * height),
            minWidth: 2,
          }}
        />
      ))}
    </div>
  );
}
