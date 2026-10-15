"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Phone, PhoneOff, Mic, MicOff, Volume2, X, Minus } from "lucide-react";
import { useAuth } from "./auth-provider";
import { useRealtime } from "./realtime-provider";

type Call = { id: string; conversation_id: string; caller_id: string; callee_id: string; owned: boolean; offer: string; answer: string | null; state: "ringing" | "active" | "ended"; expires_at: string; peer_name?: string };
type Phase = "idle" | "preparing" | "outgoing" | "incoming" | "connecting" | "connected";
const Context = createContext<{ start: (id: string, name: string) => void; busy: boolean }>({ start: () => {}, busy: false });
export const useAudioCall = () => useContext(Context);

async function request(body?: object, clientId?: string) {
  const response = await fetch("/api/calls", { method: body ? "POST" : "GET", cache: "no-store", headers: body ? { "Content-Type": "application/json" } : clientId ? { "X-Call-Client": clientId } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Could not connect. Please try again.");
  return data.call as Call | null;
}
async function description(pc: RTCPeerConnection) {
  if (pc.iceGatheringState !== "complete") await new Promise<void>((resolve) => {
    const done = () => { clearTimeout(timer); pc.removeEventListener("icegatheringstatechange", change); resolve(); };
    const change = () => { if (pc.iceGatheringState === "complete") done(); };
    const timer = setTimeout(done, 5000); pc.addEventListener("icegatheringstatechange", change);
  });
  if (pc.signalingState === "closed" || !pc.localDescription) throw new Error("Call cancelled.");
  return pc.localDescription.sdp;
}

export function AudioCallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const { subscribe, connected } = useRealtime();
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const [call, setCall] = useState<Call | null>(null);
  const callRef = useRef<Call | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [needsPlay, setNeedsPlay] = useState(false);
  const client = useRef("");
  const pc = useRef<RTCPeerConnection | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const syncRef = useRef<(() => void) | null>(null);
  const generation = useRef(0);
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setStatus = useCallback((value: Phase) => { phaseRef.current = value; setPhase(value); }, []);
  const storeCall = useCallback((value: Call | null) => { callRef.current = value; setCall(value); }, []);
  const cleanup = useCallback(() => {
    generation.current++;
    if (deadline.current) clearTimeout(deadline.current);
    const connection = pc.current; pc.current = null;
    if (connection) { connection.onconnectionstatechange = null; connection.ontrack = null; connection.close(); }
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (audio.current) { audio.current.pause(); audio.current.srcObject = null; }
    storeCall(null); setStatus("idle"); setMuted(false); setMinimized(false); setNeedsPlay(false);
  }, [setStatus, storeCall]);
  const end = useCallback((message = "") => {
    const current = callRef.current;
    cleanup(); setError(message);
    if (current) void request({ action: "end", id: current.id, clientId: client.current }).catch(() => {});
  }, [cleanup]);

  const prepare = useCallback(async (token: number) => {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error("Audio calls need an up-to-date browser and HTTPS.");
    let media: MediaStream;
    try { media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }); }
    catch (cause) { throw new Error(cause instanceof DOMException && cause.name === "NotAllowedError" ? "Microphone permission is needed. Allow it in your browser’s site settings, then try again." : "Microphone unavailable. Check that it is connected and not in use by another app."); }
    if (generation.current !== token) { media.getTracks().forEach(track => track.stop()); throw new Error("Call cancelled."); }
    stream.current = media;
    const connection = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pc.current = connection;
    media.getTracks().forEach(track => connection.addTrack(track, media));
    connection.ontrack = event => {
      if (!audio.current) return;
      audio.current.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      void audio.current.play().catch(() => setNeedsPlay(true));
    };
    connection.onconnectionstatechange = () => {
      if (pc.current !== connection) return;
      if (connection.connectionState === "connected") { if (deadline.current) clearTimeout(deadline.current); setStatus("connected"); setMinimized(true); }
      if (connection.connectionState === "failed") end("This network could not connect a direct call. Try another Wi-Fi or mobile network. Relay calling is not configured yet.");
      if (connection.connectionState === "disconnected") {
        setStatus("connecting");
        if (deadline.current) clearTimeout(deadline.current);
        deadline.current = setTimeout(() => end("Connection lost. Check your network and call again."), 15000);
      }
    };
    deadline.current = setTimeout(() => end("No connection. The other person may be offline, or this network needs a relay. Try another network."), 45000);
    return connection;
  }, [end, setStatus]);

  const start = useCallback(async (conversationId: string, peerName: string) => {
    if (phaseRef.current !== "idle") return;
    client.current ||= crypto.randomUUID();
    setError(""); setName(peerName); setStatus("preparing");
    const token = ++generation.current;
    try {
      const connection = await prepare(token);
      await connection.setLocalDescription(await connection.createOffer());
      const sdp = await description(connection);
      if (token !== generation.current) return;
      const created = await request({ action: "invite", conversationId, clientId: client.current, sdp });
      if (token !== generation.current) { if (created) void request({ action: "end", id: created.id, clientId: client.current }).catch(() => {}); return; }
      storeCall(created); setStatus("outgoing");
    } catch (cause) { if (token === generation.current) end(cause instanceof Error ? cause.message : "Could not start the call."); }
  }, [end, prepare, setStatus, storeCall]);

  const toggleMute = () => {
    const next = !muted;
    stream.current?.getAudioTracks().forEach(track => { track.enabled = !next; });
    setMuted(next);
  };
  const answer = async () => {
    const current = callRef.current; if (!current || phaseRef.current !== "incoming") return;
    setStatus("connecting"); const token = ++generation.current;
    try {
      const connection = await prepare(token);
      await connection.setRemoteDescription({ type: "offer", sdp: current.offer });
      await connection.setLocalDescription(await connection.createAnswer());
      const sdp = await description(connection);
      if (token !== generation.current) return;
      const accepted = await request({ action: "answer", id: current.id, clientId: client.current, sdp });
      if (token === generation.current) storeCall(accepted);
    } catch (cause) { if (token === generation.current) end(cause instanceof Error ? cause.message : "Could not answer the call."); }
  };

  useEffect(() => {
    if (!userId) return;
    client.current ||= crypto.randomUUID();
    let disposed = false; let reading = false; let repeat = false;
    const sync = async () => {
      if (reading) { repeat = true; return; } reading = true;
      const token = generation.current;
      try {
        const current = await request(undefined, client.current); if (disposed || token !== generation.current) return;
        if (!current && !callRef.current && phaseRef.current === "idle" && new URLSearchParams(window.location.search).has("call")) { setName("Audio call"); setError("This call has ended or was answered on another device."); }
        if (!current) { if (callRef.current) { cleanup(); setError("Call ended or was not answered."); } return; }
        if (current.callee_id === userId && current.state === "ringing" && phaseRef.current === "idle") {
          storeCall(current); setName(current.peer_name ?? "Circlo contact"); setStatus("incoming");
        } else if (callRef.current?.id === current.id) {
          if (current.callee_id === userId && current.state === "active" && !current.owned) { cleanup(); setError("Call answered on another browser."); return; }
          storeCall(current);
          const connection = pc.current;
          if (current.caller_id === userId && current.answer && connection?.signalingState === "have-local-offer") {
            setStatus("connecting"); await connection.setRemoteDescription({ type: "answer", sdp: current.answer });
          }
        }
      } catch { /* Bounded call deadlines handle temporary transport failures. */ } finally { reading = false; if (repeat && !disposed) { repeat = false; void sync(); } }
    };
    syncRef.current = () => { void sync(); };
    void sync();
    const unsubscribe = subscribe(event => { if (event.type === "call:changed") void sync(); });
    // Poll only while a call is open; incoming calls use the existing SSE channel.
    const timer = setInterval(() => { if (callRef.current) void sync(); }, 2000);
    const heartbeat = setInterval(() => {
      const current = callRef.current;
      if (current?.state === "active" && pc.current) void request({ action: "heartbeat", id: current.id, clientId: client.current }).catch(() => {});
    }, 15000);
    const leaving = () => {
      const current = callRef.current;
      if (current) navigator.sendBeacon("/api/calls", new Blob([JSON.stringify({ action: "end", id: current.id, clientId: client.current })], { type: "application/json" }));
    };
    window.addEventListener("pagehide", leaving);
    window.addEventListener("online", sync);
    const visible = () => { if (document.visibilityState === "visible") void sync(); };
    document.addEventListener("visibilitychange", visible);
    return () => { disposed = true; syncRef.current = null; unsubscribe(); clearInterval(timer); clearInterval(heartbeat); window.removeEventListener("pagehide", leaving); window.removeEventListener("online", sync); document.removeEventListener("visibilitychange", visible); cleanup(); };
  }, [userId, subscribe, cleanup, storeCall, setStatus]);

  useEffect(() => {
    if (phase !== "incoming") return;
    const ring = () => window.dispatchEvent(new Event("circlo:incoming-call"));
    ring(); const timer = setInterval(ring, 4000);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => { if (connected) syncRef.current?.(); }, [connected]);

  const busy = phase !== "idle";
  const contextValue = useMemo(() => ({ start: (id: string, peer: string) => { void start(id, peer); }, busy }), [start, busy]);
  return <Context.Provider value={contextValue}>
    {children}
    <audio ref={audio} autoPlay className="hidden" />
    {minimized && phase === "connected" && !error && !needsPlay ? <section role="region" aria-label="Audio call" className="fixed left-3 top-[max(0.375rem,env(safe-area-inset-top))] z-[200] flex w-[calc(100%_-_8rem)] max-w-sm sm:left-auto sm:right-4 sm:top-16 sm:w-72 items-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-2 shadow-xl">
      <button type="button" aria-label="Open call controls" className="min-h-11 min-w-0 flex-1 text-left" onClick={() => setMinimized(false)}><span className="block truncate text-xs font-semibold">{name}</span><span className="block text-[10px] text-[var(--muted)]">Audio connected</span></button>
      <button type="button" aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted} className="flex h-11 w-11 shrink-0 items-center justify-center" onClick={toggleMute}>{muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</button>
      <button type="button" aria-label="End call" className="flex h-11 w-11 shrink-0 items-center justify-center text-[var(--danger)]" onClick={() => end()}><PhoneOff className="h-4 w-4" /></button>
    </section> : phase !== "idle" || error ? <section role="region" aria-label="Audio call" className="fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[200] mx-auto max-h-[85dvh] max-w-sm overflow-y-auto rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl">
      <div className="flex items-start gap-3"><Phone className="mt-1 h-5 w-5 shrink-0 text-[var(--accent)]" /><div className="min-w-0 flex-1"><p className="truncate font-semibold">{name || "Audio call"}</p><p role="status" className="mt-1 text-sm text-[var(--muted)]">{error || ({ idle: "", preparing: "Preparing microphone…", incoming: "Incoming audio call", outgoing: "Calling…", connecting: "Connecting audio…", connected: "Audio connected" }[phase])}</p></div>{phase === "connected" ? <button type="button" aria-label="Minimize call controls" className="min-h-11 min-w-11" onClick={() => setMinimized(true)}><Minus className="mx-auto h-5 w-5" /></button> : null}{phase === "idle" ? <button aria-label="Dismiss call notice" className="min-h-11 min-w-11" onClick={() => setError("")}><X className="mx-auto h-5 w-5" /></button> : null}</div>
      {phase === "incoming" ? <p className="mt-3 text-xs text-[var(--muted)]">Answer to share your microphone and establish a direct encrypted audio connection. Direct calls can reveal your network address to the other person.</p> : null}
      {phase !== "idle" ? <div className="mt-4 flex flex-wrap gap-3">
        {phase === "incoming" ? <button className="btn btn-primary min-h-11 flex-1" onClick={() => void answer()}>Answer</button> : null}
        {phase === "connected" ? <button className="btn btn-secondary min-h-11 flex-1" aria-pressed={muted} onClick={toggleMute}>{muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}{muted ? "Unmute" : "Mute"}</button> : null}
        <button className="btn btn-secondary min-h-11 flex-1" onClick={() => end()}><PhoneOff className="h-4 w-4" />{phase === "incoming" ? "Decline" : "End call"}</button>
      </div> : null}
      {needsPlay ? <button className="btn btn-secondary mt-3 w-full" onClick={() => { void audio.current?.play().then(() => { setNeedsPlay(false); setError(""); }).catch(() => setError("Tap again to allow audio playback in your browser.")); }}><Volume2 className="h-4 w-4" />Play call audio</button> : null}
      {call ? <p className="mt-3 text-xs text-[var(--muted)]">Audio only · No recording · Keep Circlo open during the call</p> : null}
    </section> : null}
  </Context.Provider>;
}
