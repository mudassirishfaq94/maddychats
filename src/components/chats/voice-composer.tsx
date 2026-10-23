"use client";

import { Loader2, Pause, Play, Send, Square, Trash2 } from "lucide-react";
import type { SafeUser } from "@/lib/types";
import type { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { AudioMessage } from "./audio-message";
import { RecordingWaveform } from "./waveform";

export function VoiceComposer({ recorder, me, sending, phase, progress, onSend, onCancelUpload }: {
  recorder: ReturnType<typeof useVoiceRecorder>; me: SafeUser; sending: boolean;
  phase: "encrypting" | "uploading" | "finishing" | null; progress: number | null;
  onSend: () => void; onCancelUpload: () => void;
}) {
  const recorded = recorder.state === "recorded", paused = recorder.state === "paused";
  const button = "flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-full border border-[var(--border)] px-3 text-xs disabled:opacity-40";
  const duration = `${Math.floor(recorder.duration / 60)}:${String(Math.floor(recorder.duration % 60)).padStart(2, "0")}`;
  return <section aria-label="Voice message studio" className="mb-2 min-w-0 rounded-3xl border border-[var(--border)] bg-[var(--card-2)] p-3 sm:p-4">
    <header className="mb-3 flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${paused || recorded ? "bg-[var(--muted)]" : "bg-[var(--action)] motion-safe:animate-pulse"}`} /><p className="min-w-0 flex-1 text-sm font-semibold">{recorded ? "Your voice, before you send" : paused ? "Take your time" : "You have the floor"}</p><span className="text-xs tabular-nums text-[var(--muted)]">{duration}</span></header>
    {recorded && recorder.audioUrl ? <AudioMessage src={recorder.audioUrl} own sender={me} duration={recorder.duration} /> : <RecordingWaveform active={!paused} height={32} className="mb-3 w-full" />}
    <div className="mt-3 flex items-center gap-2">
      <button type="button" aria-label={recorded ? "Delete recording" : "Cancel recording"} disabled={sending} onClick={recorded ? recorder.clearRecording : recorder.cancelRecording} className={`${button} text-[var(--muted)]`}><Trash2 className="h-4 w-4" /><span>Discard</span></button>
      <span className="min-w-0 flex-1 text-xs text-[var(--muted)]">{recorded ? "Listen back. Send when ready." : "Hands-free recording"}</span>
      {recorded ? <button type="button" aria-label="Send voice message" disabled={sending} onClick={onSend} className="btn btn-primary h-11 w-11 shrink-0 rounded-full! p-0!">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
        : <><button type="button" aria-label={paused ? "Resume recording" : "Pause recording"} onClick={paused ? recorder.resumeRecording : recorder.pauseRecording} className={button}>{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button><button type="button" aria-label="Stop recording" onClick={recorder.stopRecording} className={`${button} bg-[var(--surface)]`}><Square className="h-4 w-4" /></button></>}
    </div>
    {sending ? <div role="status" className="mt-3 flex items-center gap-2 border-t border-[var(--border)] pt-3 text-xs"><Loader2 className="h-4 w-4 shrink-0 animate-spin" /><span className="min-w-0 flex-1">{phase === "uploading" ? `Uploading · ${Math.max(0, Math.min(100, progress ?? 0))}%` : phase === "finishing" ? "Almost done…" : "Preparing…"}</span>{phase !== "finishing" ? <button type="button" onClick={onCancelUpload} className="min-h-9 px-2 font-semibold">Cancel upload</button> : null}</div> : null}
  </section>;
}
