"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Camera, Check, Loader2, MessageCircle, Search, SquarePen, Users, X, UserX } from "lucide-react";
import type { ConversationDetail, PublicUser } from "@/lib/types";
import { Avatar } from "@/components/avatar";

type Mode = "choose" | "direct" | "group-people" | "group-info";

export function NewChatDialog({ start = "choose", openExternally, onExternalClose }: { start?: "choose" | "direct" | "group-people"; openExternally?: boolean; onExternalClose?: () => void }) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openExternally ?? internalOpen;
  const [mode, setMode] = useState<Mode>(start);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicUser[]>([]);
  const [selected, setSelected] = useState<PublicUser[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setMode(start); setQuery(""); setResults([]); setSelected([]); setName("");
    setDescription(""); setImage(null); setError(null); setStarting(false);
  }
  function close() { setInternalOpen(false); reset(); onExternalClose?.(); }

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  useEffect(() => {
    if (!open || (mode !== "direct" && mode !== "group-people")) return;
    const q = query.trim(); if (q.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, { signal: controller.signal, cache: "no-store" });
        const data = await res.json() as { users?: PublicUser[] }; setResults(data.users ?? []);
      } catch { if (!controller.signal.aborted) setResults([]); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open, mode]);

  async function startDirect(person: PublicUser) {
    setStarting(true); setError(null);
    const res = await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: person.id }) });
    const data = await res.json().catch(() => null) as { conversation?: ConversationDetail; error?: string } | null;
    if (!res.ok || !data?.conversation) { setError(data?.error ?? "Could not start the conversation."); setStarting(false); return; }
    close(); router.push(`/app/chats/${data.conversation.id}`); router.refresh();
  }

  async function createGroup() {
    if (!name.trim() || selected.length < 1) { setError("Enter a group name and select at least one person."); return; }
    setStarting(true); setError(null);
    try {
      const res = await fetch("/api/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description, memberIds: selected.map((u) => u.id) }) });
      const data = await res.json().catch(() => null) as { conversation?: ConversationDetail; error?: string } | null;
      if (!res.ok || !data?.conversation) throw new Error(data?.error ?? "Could not create the group.");
      if (image) {
        const form = new FormData(); form.append("file", image);
        const upload = await fetch(`/api/groups/${data.conversation.id}/avatar`, { method: "POST", body: form });
        if (!upload.ok) throw new Error("The group was created, but its image could not be uploaded.");
      }
      close(); router.push(`/app/chats/${data.conversation.id}`); router.refresh();
    } catch (cause) { setError((cause as Error).message); setStarting(false); }
  }

  const title = mode === "choose" ? "New chat" : mode === "direct" ? "New message" : mode === "group-people" ? "Select people" : "Group info";
  return <>
    <button type="button" onClick={() => setInternalOpen(true)} aria-label={start === "group-people" ? "New group" : "New chat"} title={start === "group-people" ? "New group" : "New chat"} className={start === "group-people" ? "btn min-h-[44px] min-w-[44px] gap-1.5 rounded-xl! px-2.5! text-xs!" : "btn btn-primary min-h-[44px] min-w-[44px] gap-1.5 rounded-xl! px-2.5! text-xs!"}>{start === "group-people" ? <Users className="h-4 w-4" /> : <SquarePen className="h-4 w-4" />}<span className="hidden sm:inline">{start === "group-people" ? "New group" : "New chat"}</span></button>
    {open ? <div role="dialog" aria-modal="true" aria-label={title} className="dialog-backdrop pt-[6vh] animate-fade-up" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="card-glass dialog-card max-w-md rounded-3xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {mode !== "choose" ? <button type="button" aria-label="Back" className="flex h-8 w-8 items-center justify-center rounded-full" onClick={() => { setError(null); setMode(mode === "group-info" ? "group-people" : "choose"); }}><ArrowLeft className="h-4 w-4" /></button> : null}
            <h3 className="font-display text-lg font-bold">{title}</h3>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)]"><X className="h-4 w-4" /></button>
        </div>

        {mode === "choose" ? <div className="mt-4 space-y-2">
          <button type="button" onClick={() => setMode("group-people")} className="flex w-full items-center gap-3 rounded-2xl p-3 text-left hover:bg-[var(--surface-2)]"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)] text-white"><Users className="h-5 w-5" /></span><span><b className="block text-sm">New group</b><small className="text-[var(--muted)]">Create a conversation with multiple people</small></span></button>
          <button type="button" onClick={() => setMode("direct")} className="flex w-full items-center gap-3 rounded-2xl p-3 text-left hover:bg-[var(--surface-2)]"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-2)]"><MessageCircle className="h-5 w-5" /></span><span><b className="block text-sm">New message</b><small className="text-[var(--muted)]">Start a direct chat</small></span></button>
        </div> : null}

        {(mode === "direct" || mode === "group-people") ? <>
          {mode === "group-people" && selected.length ? <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{selected.map((u) => <button type="button" key={u.id} onClick={() => setSelected((s) => s.filter((x) => x.id !== u.id))} className="flex shrink-0 flex-col items-center text-[0.65rem]"><Avatar user={u} size={34} /><span className="mt-1 max-w-14 truncate">{u.displayName}</span></button>)}</div> : null}
          <div className="relative mt-4"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" /><input ref={inputRef} value={query} onChange={(e) => { const value = e.target.value; setQuery(value); setLoading(value.trim().length >= 3); }} placeholder="Type exact full name or username…" className="field-input field-input--icon" /></div>
          <div className="mt-3 max-h-[48vh] overflow-y-auto">
            {loading ? (
              <p className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></p>
            ) : query.trim().length < 3 ? (
              <p className="py-8 text-center text-sm text-[var(--muted)]">Type a full name or username to search</p>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center py-8">
                <UserX className="h-8 w-8 text-[var(--muted)]" />
                <p className="mt-2 text-sm font-medium">No users found</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Try typing the exact full name or username</p>
              </div>
            ) : (
              <ul className="space-y-1">
                {results.map((person) => {
                  const chosen = selected.some((u) => u.id === person.id);
                  return (
                    <li key={person.id}>
                      <button
                        type="button"
                        disabled={starting}
                        onClick={() => mode === "direct" ? void startDirect(person) : setSelected((s) => chosen ? s.filter((u) => u.id !== person.id) : [...s, person])}
                        className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-[var(--surface-2)]"
                      >
                        <Avatar user={person} size={38} />
                        <span className="min-w-0 flex-1">
                          <b className="block truncate text-sm">{person.displayName}</b>
                          <span className="flex items-center gap-1">
                            <small className="text-[var(--muted)]">@{person.username}</small>
                            {person.lastSeenAt && (
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" title="Online" />
                            )}
                          </span>
                        </span>
                        {chosen ? <Check className="h-5 w-5 text-[var(--accent-fg)]" /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {mode === "group-people" ? <button type="button" disabled={!selected.length} onClick={() => setMode("group-info")} className="btn btn-primary mt-4 w-full disabled:opacity-50">Next ({selected.length})</button> : null}
        </> : null}

        {mode === "group-info" ? <div className="mt-5 space-y-4">
          <label className="mx-auto flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-[var(--surface-2)] text-[var(--muted)]">{image ? <img src={URL.createObjectURL(image)} alt="Group preview" className="h-full w-full object-cover" /> : <Camera className="h-7 w-7" />}<input type="file" accept="image/*" className="sr-only" onChange={(e) => setImage(e.target.files?.[0] ?? null)} /></label>
          <div><label className="mb-1 block text-xs font-semibold">Group name</label><input ref={inputRef} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} className="field-input" placeholder="Group name" /></div>
          <div><label className="mb-1 block text-xs font-semibold">Description <span className="font-normal text-[var(--muted)]">(optional)</span></label><textarea value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} className="field-input min-h-20 resize-none" placeholder="What is this group about?" /></div>
          <button type="button" disabled={starting || !name.trim()} onClick={() => void createGroup()} className="btn btn-primary w-full disabled:opacity-50">{starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />} Create group</button>
        </div> : null}
        {error ? <p className="mt-3 flex items-center gap-2 text-sm text-[var(--danger)]"><AlertTriangle className="h-4 w-4" />{error}</p> : null}
      </div>
    </div> : null}
  </>;
}
