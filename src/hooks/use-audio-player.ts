"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeAudioUrl } from "@/lib/audio-analysis";

/**
 * Global singleton that tracks the currently playing audio element.
 * When a new voice message starts playing, the previous one is paused.
 */
let currentAudio: HTMLAudioElement | null = null;
let listeners: Array<() => void> = [];

function notify() {
  listeners.forEach((fn) => fn());
}

export function getCurrentAudioId(): string | null {
  return currentAudio?.dataset?.voiceId ?? null;
}

export function setCurrentAudio(audio: HTMLAudioElement | null, voiceId: string) {
  if (currentAudio && currentAudio !== audio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }
  if (audio) audio.dataset.voiceId = voiceId;
  currentAudio = audio;
  notify();
}

export function clearCurrentAudio(audio: HTMLAudioElement) {
  if (currentAudio === audio) {
    currentAudio = null;
    notify();
  }
}

/**
 * Hook that subscribes to the global audio player state.
 * Returns the ID of the currently playing voice message.
 */
export function useGlobalAudioPlayer() {
  const [playingId, setPlayingId] = useState<string | null>(getCurrentAudioId());

  useEffect(() => {
    const listener = () => setPlayingId(getCurrentAudioId());
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((fn) => fn !== listener);
    };
  }, []);

  return playingId;
}

/**
 * MediaRecorder WebM files do not always contain a seekable duration header.
 * Decode the samples to get the authoritative duration instead of using the
 * common "seek very far" workaround, which can produce bogus multi-minute
 * durations for recordings that are only a few seconds long.
 */
/**
 * Hook for an individual voice message to manage its playback.
 */
export function useVoicePlayback(voiceId: string, src: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  // Create audio element once
  useEffect(() => {
    const controller = new AbortController();
    let decodedDurationResolved = false;
    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = src;
    audioRef.current = audio;

    const readDuration = () => {
      if (decodedDurationResolved) return;
      const d = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      if (d) setDuration(d);
    };

    const onTimeUpdate = () => {
      const time = Number.isFinite(audio.currentTime) && audio.currentTime > 0
        ? audio.currentTime
        : 0;
      setCurrentTime(time);
    };
    const onPlay = () => {
      setPlaying(true);
      setCurrentAudio(audio, voiceId);
    };
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
      audio.currentTime = 0;
      clearCurrentAudio(audio);
    };
    const onLoadedData = () => setLoading(false);
    const onError = () => {
      setError(true);
      setLoading(false);
    };

    audio.addEventListener("loadedmetadata", readDuration);
    audio.addEventListener("durationchange", readDuration);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("loadeddata", onLoadedData);
    audio.addEventListener("error", onError);

    // This also repairs duration for existing malformed WebM voice notes.
    void analyzeAudioUrl(src)
      .then(({ duration: decodedDuration }) => {
        if (!controller.signal.aborted && decodedDuration) {
          decodedDurationResolved = true;
          setDuration(decodedDuration);
        }
      })
      .catch((decodeError: unknown) => {
        if ((decodeError as DOMException)?.name !== "AbortError") readDuration();
      });

    return () => {
      controller.abort();
      audio.removeEventListener("loadedmetadata", readDuration);
      audio.removeEventListener("durationchange", readDuration);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("loadeddata", onLoadedData);
      audio.removeEventListener("error", onError);
      audio.pause();
      audio.src = "";
      clearCurrentAudio(audio);
    };
  }, [src, voiceId]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
    } else {
      try {
        await audio.play();
      } catch {
        setPlaying(false);
      }
    }
  }, []);

  const seek = useCallback(
    (time: number) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;
      const t = Math.min(duration, Math.max(0, time));
      audio.currentTime = t;
      setCurrentTime(t);
    },
    [duration],
  );

  const cyclePlaybackRate = useCallback(() => {
    setPlaybackRate((current) => {
      const next = current === 1 ? 1.5 : current === 1.5 ? 2 : 1;
      if (audioRef.current) audioRef.current.playbackRate = next;
      return next;
    });
  }, []);

  return {
    audioRef,
    playing,
    currentTime,
    duration,
    loading,
    error,
    playbackRate,
    cyclePlaybackRate,
    togglePlay,
    seek,
  };
}
