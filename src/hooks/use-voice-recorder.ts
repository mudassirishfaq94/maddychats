"use client";

import { useCallback, useRef, useState } from "react";

export type RecorderState = "idle" | "recording" | "recorded";

interface UseVoiceRecorderReturn {
  state: RecorderState;
  duration: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
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
      // First check current permission state to give better error messages
      try {
        const permissionStatus = await navigator.permissions.query({ name: "microphone" as PermissionName });
        if (permissionStatus.state === "denied") {
          setError(
            "Microphone access was previously denied and is now blocked. To fix this:\n" +
            "\n1. Click the lock icon (🔒) in your browser's address bar\n" +
            "2. Find 'Microphone' and set it to 'Allow'\n" +
            "3. Refresh the page and try again"
          );
          return;
        }
      } catch {
        // permissions.query not supported — continue with getUserMedia
      }

      // Use simple constraints for maximum compatibility
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
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 200);
    } catch (err) {
      const name = (err as DOMException).name || "";
      const message = (err as Error).message || "";
      console.error("[voice-recorder] Error:", name, message, err);
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError(
          "Microphone access denied. To fix this:\n" +
          "\n1. Click the lock icon (🔒) or microphone icon in your browser's address bar\n" +
          "2. Set Microphone to 'Allow'\n" +
          "3. Refresh the page and try again"
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
  }, [cleanup]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state === "recording") {
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
    cancelRecording,
    clearRecording,
  };
}
