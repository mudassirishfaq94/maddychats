"use client";
import { createConditionalInterval } from "@/lib/conditional-interval";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Phone, PhoneOff, Mic, MicOff, Volume2, X, Minus, ShieldCheck, Headphones } from "lucide-react";
import { useAuth } from "./auth-provider";
import { useRealtime } from "./realtime-provider";
import { hostedCall, hostedCallAudio, hasHostedPushBridge, type CallAudioState } from "@/lib/native-push-bridge";
import { formatCallDuration } from "@/lib/call-duration";
import { consumeCallAnswer } from "@/lib/call-answer-grant";
import { usePathname, useRouter } from "next/navigation";
import { notificationChatLocked } from "@/lib/local-notification-preview";

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
  const dedicated = usePathname() === "/app/call";
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id;
  const { subscribe, connected } = useRealtime();
  const refreshPolling = useRef<(() => void) | null>(null);
  const streamConnected = useRef(connected);
  useEffect(() => { streamConnected.current = connected; refreshPolling.current?.(); }, [connected]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [answerPending, setAnswerPending] = useState(false);
  const phaseRef = useRef<Phase>("idle");
  const [call, setCall] = useState<Call | null>(null);
  const currentCallId = call?.id;
  const callRef = useRef<Call | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const connectedAt = useRef<number | null>(null);
  const [routes, setRoutes] = useState<CallAudioState | null>(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [minimized, setMinimized] = useState(false);
  const [needsPlay, setNeedsPlay] = useState(false);
  const client = useRef("");
  const nativeSession = useRef<{ callId: string; userId: string; clientId: string; conversationId: string } | null>(null);
  const relayConfigured = useRef(false);
  const pc = useRef<RTCPeerConnection | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const syncRef = useRef<(() => void) | null>(null);
  const generation = useRef(0);
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setStatus = useCallback((value: Phase) => { phaseRef.current = value; setPhase(value); }, []);
  const storeCall = useCallback((value: Call | null) => { callRef.current = value; setCall(value); refreshPolling.current?.(); }, []);
  const cleanup = useCallback(() => {
    generation.current++;
    if (nativeSession.current) { void hostedCall("call-stop", nativeSession.current); nativeSession.current = null; }
    if (deadline.current) clearTimeout(deadline.current);
    const connection = pc.current; pc.current = null;
    if (connection) { connection.onconnectionstatechange = null; connection.ontrack = null; connection.close(); }
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (audio.current) { audio.current.pause(); audio.current.srcObject = null; }
    storeCall(null); setStatus("idle"); setMuted(false); setMinimized(false); setNeedsPlay(false);
    connectedAt.current = null; setElapsed(0); setRoutes(null); setRouteError(""); setRouteBusy(false);
  }, [setStatus, storeCall]);
  const end = useCallback((message = "") => {
    const current = callRef.current;
    cleanup(); setError(message || (window.location.pathname === "/app/call" ? "Call ended." : ""));
    if (current) void request({ action: "end", id: current.id, clientId: client.current }).catch(() => {});
  }, [cleanup]);

  const protectNativeCall = useCallback(async (current: Call | null) => {
    if (!current || !userId) return;
    const session = { callId: current.id, userId, clientId: client.current, conversationId: current.conversation_id };
    if (await hostedCall("call-start", session)) {
      if (callRef.current?.id === current.id) nativeSession.current = session;
      else void hostedCall("call-stop", session);
    }
  }, [userId]);

  const prepare = useCallback(async (token: number) => {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error("Audio calls need an up-to-date browser and HTTPS.");
    // Fetch short-lived relay credentials while the microphone prompt is open.
    // Older servers/APKs retain direct calling if the new capability is absent.
    const configuration = fetch("/api/calls/ice", { cache: "no-store", signal: AbortSignal.timeout(3000) })
      .then(async response => response.ok ? await response.json() as { iceServers: RTCIceServer[]; relayConfigured: boolean } : response.status===404 ? null : {error:"Call connection service is temporarily unavailable. Please try again shortly."}).catch(() => ({error:"Call connection service could not be reached. Check your connection and retry."}));
    let media: MediaStream;
    try { media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }); }
    catch (cause) { throw new Error(cause instanceof DOMException && cause.name === "NotAllowedError" ? "Microphone permission is needed. Allow it in your browser’s site settings, then try again." : "Microphone unavailable. Check that it is connected and not in use by another app."); }
    if (generation.current !== token) { media.getTracks().forEach(track => track.stop()); throw new Error("Call cancelled."); }
    const ice = await configuration;
    if(ice&&"error" in ice){media.getTracks().forEach(track=>track.stop());throw new Error(ice.error);}
    if (generation.current !== token) { media.getTracks().forEach(track => track.stop()); throw new Error("Call cancelled."); }
    stream.current = media;
    relayConfigured.current = ice?.relayConfigured === true;
    const connection = new RTCPeerConnection({ iceServers: ice?.iceServers ?? [{ urls: "stun:stun.l.google.com:19302" }] });
    pc.current = connection;
    media.getTracks().forEach(track => connection.addTrack(track, media));
    connection.ontrack = event => {
      if (!audio.current) return;
      audio.current.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      void audio.current.play().catch(() => setNeedsPlay(true));
    };
    connection.onconnectionstatechange = () => {
      if (pc.current !== connection) return;
      if (connection.connectionState === "connected") { if (deadline.current) clearTimeout(deadline.current); connectedAt.current ??= performance.now(); setStatus("connected"); setMinimized(true); }
      if (connection.connectionState === "failed") end(relayConfigured.current ? "The call could not connect through this network. Check your connection and try again." : "The call could not connect. Please try again shortly.");
      if (connection.connectionState === "disconnected") {
        setStatus("connecting");
        if (deadline.current) clearTimeout(deadline.current);
        deadline.current = setTimeout(() => end("Connection lost. Check your network and call again."), 15000);
      }
    };
    deadline.current = setTimeout(() => end("The call did not connect in time. Please try again."), 45000);
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
      await protectNativeCall(created);
    } catch (cause) { if (token === generation.current) end(cause instanceof Error ? cause.message : "Could not start the call."); }
  }, [end, prepare, setStatus, storeCall, protectNativeCall]);

  const toggleMute = () => {
    const next = !muted;
    stream.current?.getAudioTracks().forEach(track => { track.enabled = !next; });
    setMuted(next);
  };
  const changeOutput = async (deviceId?: string) => {
    if (routeBusy) return;
    setRouteBusy(true); setRouteError("");
    const current = callRef.current;
    try {
      if (nativeSession.current) {
        const value = await hostedCallAudio({ ...nativeSession.current, deviceId });
        if (callRef.current?.id === current?.id) {
          if (!value) throw new Error("Audio output is unavailable on this device.");
          setRoutes(value);
        }
      } else {
        // Browser support is optional. Never render a speaker toggle that cannot route audio.
        const devices = navigator.mediaDevices as MediaDevices & { selectAudioOutput?: () => Promise<MediaDeviceInfo> };
        const player = audio.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
        if (!devices.selectAudioOutput || !player?.setSinkId) throw new Error("Choose audio output in your device settings.");
        const selected = await devices.selectAudioOutput();
        if (callRef.current?.id === current?.id) await player.setSinkId(selected.deviceId);
      }
    } catch (cause) {
      if (callRef.current?.id === current?.id) setRouteError(cause instanceof DOMException && cause.name === "NotAllowedError" ? "Audio output selection was cancelled or not permitted." : cause instanceof Error ? cause.message : "Could not change audio output.");
    } finally { setRouteBusy(false); }
  };
  const answer = useCallback(async () => {
    const current = callRef.current; if (!current || phaseRef.current !== "incoming") return;
    setStatus("connecting"); const token = ++generation.current;
    try {
      const connection = await prepare(token);
      await connection.setRemoteDescription({ type: "offer", sdp: current.offer });
      await connection.setLocalDescription(await connection.createAnswer());
      const sdp = await description(connection);
      if (token !== generation.current) return;
      const accepted = await request({ action: "answer", id: current.id, clientId: client.current, sdp });
      if (token === generation.current) { storeCall(accepted); await protectNativeCall(accepted); }
    } catch (cause) { if (token === generation.current) end(cause instanceof Error ? cause.message : "Could not answer the call."); }
  }, [prepare, setStatus, storeCall, end, protectNativeCall]);

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
          setError("");
          storeCall(current); setName(notificationChatLocked(current.conversation_id) ? "Circlo" : current.peer_name ?? "Circlo contact"); setStatus("incoming");
        }
        // A warm recipient may already be ringing when the notification's
        // Answer intent arrives. Consume its one-time proof in either state.
        if (current.callee_id === userId && current.state === "ringing" && phaseRef.current === "incoming" && callRef.current?.id === current.id) {
          const query = new URLSearchParams(window.location.search);
          const action = query.get("callAction");
          if (query.get("call") === current.id && action === "answer") {
            setAnswerPending(true);
            const proof = query.get("callActionToken");
            query.delete("callAction"); query.delete("callActionToken"); window.history.replaceState(null,"",`${window.location.pathname}?${query}`);
            if (await consumeCallAnswer(userId, current.id, proof) && !disposed && callRef.current?.id === current.id) void answer();
            setAnswerPending(false);
          }
        } else if (callRef.current?.id === current.id) {
          if (current.callee_id === userId && current.state === "active" && !current.owned) { cleanup(); setError("Call answered on another browser."); return; }
          storeCall(current);
          const connection = pc.current;
          if (current.caller_id === userId && current.answer && connection?.signalingState === "have-local-offer") {
            setStatus("connecting"); await connection.setRemoteDescription({ type: "answer", sdp: current.answer });
          }
        }
      } catch {
        if (!disposed && token === generation.current && phaseRef.current === "idle" && window.location.pathname === "/app/call") {
          setName("Audio call"); setError("Could not open this call. Check your connection and try again.");
        }
      } finally { reading = false; if (repeat && !disposed) { repeat = false; void sync(); } }
    };
    syncRef.current = () => { void sync(); };
    void sync();
    const unsubscribe = subscribe(event => { if (event.type === "call:changed") void sync(); });
    // Poll only while a call is open; incoming calls use the existing SSE channel.
    const polling = createConditionalInterval(() => Boolean(callRef.current) || (!streamConnected.current && document.visibilityState === "visible"), () => { void sync(); }, 2000);
    const heartbeat = createConditionalInterval(() => Boolean(callRef.current), () => {
      const current = callRef.current;
      if (current && pc.current && nativeSession.current) {
        void hostedCall("call-renew", nativeSession.current).then(active => {
          if (!active) nativeSession.current = null;
        });
      } else if (current?.state === "active" && pc.current) void request({ action: "heartbeat", id: current.id, clientId: client.current }).catch(() => {});
    }, 15000);
    refreshPolling.current = () => { polling.refresh(); heartbeat.refresh(); };
    refreshPolling.current();
    const leaving = () => {
      const current = callRef.current;
      // Leaving an unanswered recipient page is not Decline. A notification
      // may be reopening that page to Answer the same persisted call.
      if (current && pc.current) navigator.sendBeacon("/api/calls", new Blob([JSON.stringify({ action: "end", id: current.id, clientId: client.current })], { type: "application/json" }));
    };
    window.addEventListener("pagehide", leaving);
    window.addEventListener("online", sync);
    const visible = () => { refreshPolling.current?.(); if (document.visibilityState === "visible") void sync(); };
    document.addEventListener("visibilitychange", visible);
    return () => { disposed = true; syncRef.current = null; refreshPolling.current = null; unsubscribe(); polling.stop(); heartbeat.stop(); window.removeEventListener("pagehide", leaving); window.removeEventListener("online", sync); document.removeEventListener("visibilitychange", visible); cleanup(); };
  }, [userId, subscribe, cleanup, storeCall, setStatus, answer, end]);

  useEffect(() => {
    if (phase !== "incoming") return;
    const ring = () => window.dispatchEvent(new Event("circlo:incoming-call"));
    ring(); const timer = setInterval(ring, 4000);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "connected" && phase !== "connecting") return;
    const update = () => { if (connectedAt.current !== null) setElapsed(Math.floor((performance.now() - connectedAt.current) / 1000)); };
    update(); const timer = setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, [phase]);

  useEffect(() => {
    if (phase !== "connected" || !currentCallId || !userId) return;
    let disposed = false;
    let metadataSent = false;
    const update = async () => {
      const session = nativeSession.current;
      if (!session) return;
      if (!metadataSent) { metadataSent = true; await hostedCall("call-renew", { ...session, connected: true, muted }); }
      try { const value = await hostedCallAudio(session); if (!disposed) setRoutes(value); } catch { /* Older APKs retain existing call controls. */ }
    };
    void update();
    const visible = () => { if (document.visibilityState === "visible") void update(); };
    const timer = setInterval(visible, 3000);
    document.addEventListener("visibilitychange", visible);
    return () => { disposed = true; clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [phase, currentCallId, userId, muted]);

  useEffect(() => { if (connected) syncRef.current?.(); }, [connected]);
  useEffect(() => {
    const privacy = () => {
      const current = callRef.current;
      if (current && current.callee_id === userId) setName(notificationChatLocked(current.conversation_id) ? "Circlo" : current.peer_name ?? "Circlo contact");
    };
    window.addEventListener("maddy:locked-chats", privacy);
    window.addEventListener("storage", privacy);
    return () => { window.removeEventListener("maddy:locked-chats", privacy); window.removeEventListener("storage", privacy); };
  }, [userId]);
  useEffect(() => {
    const ended = (event: Event) => { if (nativeSession.current?.callId === (event as CustomEvent<{ callId: string }>).detail?.callId) end(); };
    const unprotected = (event: Event) => { if (nativeSession.current?.callId === (event as CustomEvent<{ callId: string }>).detail?.callId) nativeSession.current = null; };
    const open = () => { setMinimized(false); if (callRef.current) router.push(`/app/call?call=${callRef.current.id}`); syncRef.current?.(); };
    window.addEventListener("circlo:native-call-ended", ended);
    window.addEventListener("circlo:native-call-open", open);
    window.addEventListener("circlo:native-call-unprotected", unprotected);
    return () => { window.removeEventListener("circlo:native-call-ended", ended); window.removeEventListener("circlo:native-call-open", open); window.removeEventListener("circlo:native-call-unprotected", unprotected); };
  }, [end, router]);

  const busy = phase !== "idle";
  const contextValue = useMemo(() => ({ start: (id: string, peer: string) => { void start(id, peer); }, busy }), [start, busy]);
  return <Context.Provider value={contextValue}>
    {children}
    <audio ref={audio} autoPlay className="hidden" />
    {!dedicated && minimized && phase === "connected" && !error && !needsPlay ? <section role="region" aria-label="Audio call" className="fixed left-3 top-[max(0.375rem,env(safe-area-inset-top))] z-[200] flex w-[calc(100%_-_8rem)] max-w-sm sm:left-auto sm:right-4 sm:top-16 sm:w-72 items-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-2 shadow-xl">
      <button type="button" aria-label="Open call controls" className="min-h-11 min-w-0 flex-1 text-left" onClick={() => { setMinimized(false); if (call) router.push(`/app/call?call=${call.id}`); }}><span className="block truncate text-xs font-semibold">{name}</span><span className="block text-[10px] text-[var(--muted)]"><span>Audio connected</span><span className="ml-1 font-mono tabular-nums">{formatCallDuration(elapsed)}</span></span></button>
      <button type="button" aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted} className="flex h-11 w-11 shrink-0 items-center justify-center" onClick={toggleMute}>{muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</button>
      <button type="button" aria-label="End call" className="flex h-11 w-11 shrink-0 items-center justify-center text-[var(--danger)]" onClick={() => end()}><PhoneOff className="h-4 w-4" /></button>
    </section> : phase !== "idle" || error ? <section role="region" aria-label="Audio call" className={dedicated ? "fixed inset-0 z-[250] flex flex-col justify-center overflow-y-auto bg-[var(--bg)] px-6 py-[max(2rem,env(safe-area-inset-top))] sm:px-[max(1.5rem,calc((100vw-28rem)/2))]" : "fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[200] mx-auto max-h-[85dvh] max-w-sm overflow-y-auto rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl"}>
      {dedicated ? <div className="mb-12 text-center"><p className="text-xl font-semibold tracking-wide text-[var(--accent)]">circlo</p><p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-[var(--muted)]"><ShieldCheck className="h-3.5 w-3.5" />Encrypted audio call</p></div> : null}
      <div className={dedicated ? "flex flex-col items-center gap-6 text-center" : "flex items-start gap-3"}>
        {dedicated ? <div aria-hidden="true" className="flex h-28 w-28 items-center justify-center rounded-full border border-[var(--accent)]/30 bg-[var(--surface)] text-4xl font-semibold text-[var(--accent)] shadow-xl ring-8 ring-[var(--accent)]/5">{(name || "C").trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join("")}</div> : <Phone className="mt-1 h-5 w-5 shrink-0 text-[var(--accent)]" />}
        <div className="min-w-0 flex-1"><p className={dedicated ? "text-3xl font-semibold break-words" : "truncate font-semibold"}>{name || "Audio call"}</p>
          <p role="status" className="mt-3 text-sm text-[var(--muted)]">{error || (answerPending ? "Connecting audio…" : { idle: "", preparing: "Preparing microphone…", incoming: "Incoming audio call", outgoing: "Calling…", connecting: "Connecting audio…", connected: "Audio connected" }[phase])}</p>
          {phase === "connected" || elapsed > 0 ? <p aria-label="Call duration" className="mt-3 font-mono text-2xl tabular-nums tracking-wider text-[var(--accent)]">{formatCallDuration(elapsed)}</p> : null}
        </div>
        {phase === "connected" ? <button type="button" aria-label="Minimize call controls" className={dedicated ? "absolute top-4 right-4 min-h-11 min-w-11" : "min-h-11 min-w-11"} onClick={() => { setMinimized(true); if (dedicated) router.push(call ? `/app/chats/${call.conversation_id}` : "/app/chats"); }}><Minus className="mx-auto h-5 w-5" /></button> : null}
        {phase === "idle" ? <button aria-label="Dismiss call notice" className={dedicated ? "absolute top-4 right-4 min-h-11 min-w-11" : "min-h-11 min-w-11"} onClick={() => { setError(""); if (dedicated) router.replace("/app/chats"); }}><X className="mx-auto h-5 w-5" /></button> : null}
      </div>
      {phase === "incoming" ? <p className="mt-3 text-xs text-[var(--muted)]">Answer to share your microphone and establish a direct encrypted audio connection. Direct calls can reveal your network address to the other person.</p> : null}
      {phase !== "idle" ? <div className="mt-4 flex flex-wrap gap-3">
        {phase === "incoming" && !answerPending ? <button className={dedicated ? "btn min-h-14 flex-1 rounded-full bg-emerald-600 text-white" : "btn btn-primary min-h-11 flex-1"} onClick={() => void answer()}>Answer</button> : null}
        {phase === "connected" ? <button className="btn btn-secondary min-h-14 flex-1 rounded-2xl" aria-pressed={muted} onClick={toggleMute}>{muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}{muted ? "Unmute" : "Mute"}</button> : null}
        {phase === "connected" && routes?.devices.length ? <label className="flex min-h-14 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3"><Headphones aria-hidden="true" className="h-5 w-5 shrink-0" /><select aria-label="Audio output" className="min-w-0 w-full bg-[var(--surface)] text-sm" value={routes.selected} disabled={routeBusy} onChange={event => void changeOutput(event.target.value)}>{!routes.devices.some(device => device.id === routes.selected) ? <option value="">System default</option> : null}{routes.devices.map(device => <option key={device.id} value={device.id}>{device.label}</option>)}</select></label> : phase === "connected" && !hasHostedPushBridge() && typeof (navigator.mediaDevices as MediaDevices & { selectAudioOutput?: unknown }).selectAudioOutput === "function" ? <button className="btn btn-secondary min-h-14 flex-1 rounded-2xl" disabled={routeBusy} onClick={() => void changeOutput()}><Headphones className="h-5 w-5" />Audio output</button> : null}
        <button className={dedicated ? "btn min-h-14 flex-1 rounded-full bg-red-700 text-white" : "btn btn-secondary min-h-11 flex-1"} onClick={() => end()}><PhoneOff className="h-4 w-4" />{phase === "incoming" ? "Decline" : "End call"}</button>
      </div> : null}
      {routeError ? <p role="alert" className="mt-3 text-center text-sm text-[var(--danger)]">{routeError}</p> : null}
      {needsPlay ? <button className="btn btn-secondary mt-3 w-full" onClick={() => { void audio.current?.play().then(() => { setNeedsPlay(false); setError(""); }).catch(() => setError("Tap again to allow audio playback in your browser.")); }}><Volume2 className="h-4 w-4" />Play call audio</button> : null}
      {call ? <p className="mt-6 text-center text-xs text-[var(--muted)]">Audio only · No recording</p> : null}
    </section> : null}
  </Context.Provider>;
}
