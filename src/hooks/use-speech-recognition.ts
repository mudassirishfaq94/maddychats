"use client";

import { useCallback, useRef, useState } from "react";

interface UseSpeechRecognitionReturn {
  transcript: string;
  isListening: boolean;
  isSupported: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Hook for speech recognition using the Web Speech API.
 * Used to transcribe voice messages into text.
 */
export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const isSupported =
    typeof window !== "undefined" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ("SpeechRecognition" in (window as any) || "webkitSpeechRecognition" in (window as any));

  const cleanup = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onend = null;
      recognitionRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (!isSupported) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    cleanup();
    setError(null);
    setTranscript("");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Win = window as any;
    const SpeechRecognitionConstructor =
      Win.SpeechRecognition || Win.webkitSpeechRecognition;
    if (!SpeechRecognitionConstructor) {
      setError("Speech recognition is not supported.");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new SpeechRecognitionConstructor();
    recognitionRef.current = recognition;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let finalTranscript = "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      setTranscript(finalTranscript + interim);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      if (event.error === "no-speech") {
        setIsListening(false);
        return;
      }
      setError(`Speech recognition error: ${event.error}`);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setTranscript(finalTranscript);
    };

    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setError("Failed to start speech recognition.");
    }
  }, [isSupported, cleanup]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, []);

  const reset = useCallback(() => {
    cleanup();
    setTranscript("");
    setIsListening(false);
    setError(null);
  }, [cleanup]);

  return {
    transcript,
    isListening,
    isSupported,
    error,
    start,
    stop,
    reset,
  };
}
