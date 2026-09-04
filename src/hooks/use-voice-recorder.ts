"use client";

import { useCallback, useRef, useState } from "react";

export type RecorderState = "idle" | "recording" | "paused" | "recorded";

interface UseVoiceRecorderReturn {
  state: RecorderState;
  duration: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  cancelRecording: () => void;
  clearRecording: () => void;
}

export function useVoiceRecorder(): UseVoiceRecorderReturn {
  const [state, setState] = useState<RecorderState>("idle");
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const segmentStartedAtRef = useRef(0);
  const elapsedMsRef = useRef(0);

  const updateDuration = useCallback(() => {
    const activeMs = mediaRecorderRef.current?.state === "recording"
      ? Date.now() - segmentStartedAtRef.current
      : 0;
    setDuration(Math.floor((elapsedMsRef.current + activeMs) / 1000));
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    elapsedMsRef.current = 0;

    // Microphone requires a secure context (HTTPS or localhost).
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError(
        "Microphone requires HTTPS. Access this page via localhost or ask your admin to enable HTTPS."
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Microphone is not supported in this browser or the page is not served over HTTPS."
      );
      return;
    }

    try {
      // Use simple constraints for maximum compatibility.
      // Do NOT pre-check permissions.query() — it is unreliable and often
      // returns 'denied' even when the user has granted access (known browser bug).
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      streamRef.current = stream;
      chunksRef.current = [];

      // Pick the best supported mime type
      const mimeType =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
              ? "audio/ogg;codecs=opus"
              : "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setState("recorded");
        cleanup();
      };

      recorder.onerror = () => {
        setError("Recording failed. Please try again.");
        cleanup();
        setState("idle");
      };

      recorder.start(100); // Collect data every 100ms
      setState("recording");

      // Start timer
      segmentStartedAtRef.current = Date.now();
      timerRef.current = setInterval(() => {
        updateDuration();
      }, 200);
    } catch (err) {
      const name = (err as DOMException).name || "";
      const message = (err as Error).message || "";
      console.error("[voice-recorder] Error:", name, message, err);
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        const permissionsPolicy =
          typeof document !== "undefined"
            ? (document as Document & {
                permissionsPolicy?: { allowsFeature: (feature: string) => boolean };
              }).permissionsPolicy
            : undefined;
        const blockedByPolicy =
          permissionsPolicy?.allowsFeature("microphone") === false;

        if (blockedByPolicy) {
          setError(
            "Microphone access is disabled by this site's security policy. Reload the page after the updated deployment is live."
          );
          setState("idle");
          return;
        }

        setError(
          "Microphone access denied by the browser.\n\n" +
          "Try these steps:\n" +
          "1. Type chrome://settings/content/microphone in your address bar\n" +
          "2. Make sure 'Sites can ask to use your microphone' is selected\n" +
          "3. Remove ziptalks.vercel.app from any block list if present\n" +
          "4. Reload this page (Ctrl+Shift+R) and click 'Try again'\n\n" +
          "If it still fails, try opening this page in an incognito window (Ctrl+Shift+N)."
        );
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setError("No microphone found. Please connect a microphone and try again.");
      } else if (name === "NotReadableError" || name === "AbortError") {
        setError("Microphone is being used by another app. Close other apps using the microphone and try again.");
      } else {
        setError("Could not start recording: " + (message || name || "Unknown error") + ". Please try again.");
      }
      setState("idle");
    }
  }, [cleanup, updateDuration]);

  const pauseRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    elapsedMsRef.current += Date.now() - segmentStartedAtRef.current;
    recorder.pause();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    updateDuration();
    setState("paused");
  }, [updateDuration]);

  const resumeRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    segmentStartedAtRef.current = Date.now();
    recorder.resume();
    timerRef.current = setInterval(updateDuration, 200);
    setState("recording");
  }, [updateDuration]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && (mediaRecorderRef.current.state === "recording" || mediaRecorderRef.current.state === "paused")) {
      if (mediaRecorderRef.current.state === "recording") {
        elapsedMsRef.current += Date.now() - segmentStartedAtRef.current;
        updateDuration();
      }
      mediaRecorderRef.current.stop();
    }
  }, [updateDuration]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state === "recording" || mediaRecorderRef.current.state === "paused") {
        mediaRecorderRef.current.stop();
      }
    }
    cleanup();
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    setState("idle");
  }, [cleanup]);

  const clearRecording = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    setState("idle");
  }, [audioUrl]);

  return {
    state,
    duration,
    audioBlob,
    audioUrl,
    error,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    clearRecording,
  };
}
