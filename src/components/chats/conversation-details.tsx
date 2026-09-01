"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Ban,
  Bell,
  BellOff,
  FileArchive,
  FileSpreadsheet,
  FileText,
  File as FileIcon,
  Image as ImageIcon,
  Loader2,
  LogOut,
  Shield,
  ShieldOff,
  Search,
  UserPlus,
  Trash2,
  Users,
  Play,
  Pin,
  Star,
  X,
} from "lucide-react";
import type { AttachmentDTO, ConversationDetail, PublicUser } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { InlineMedia, Lightbox, humanSize } from "./attachments";
import { useRealtime } from "@/components/providers/realtime-provider";
import { cn } from "@/lib/utils";

type Tab = "media" | "files" | "pinned" | "starred";

interface SavedMessageItem {
  messageId: string;
  text: string;
  createdAt: string;
  sender: PublicUser;
  conversation?: { id: string };
}

/** Slide-in panel showing conversation details + shared media/files/links. */
export function ConversationDetails({
  conversationId,
  other,
  conversation,
  localRevision = 0,
  onClose,
}: {
  conversationId: string;
  other: PublicUser | null;
  conversation: ConversationDetail;
  localRevision?: number;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("media");
  const [media, setMedia] = useState<AttachmentDTO[]>([]);
  const [files, setFiles] = useState<(AttachmentDTO & { createdAt: string })[]>(
    [],
  );
  const [savedMessages, setSavedMessages] = useState<SavedMessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [group, setGroup] = useState(conversation);
  const [groupBusy, setGroupBusy] = useState<string | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<PublicUser[]>([]);
  const [muted, setMuted] = useState(conversation.muted);
  const [blocked, setBlocked] = useState(conversation.blocked);
  const router = useRouter();
  const { subscribe } = useRealtime();

  useEffect(() => {
    if (group.type !== "group" || memberQuery.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => void fetch(`/api/users/search?q=${encodeURIComponent(memberQuery.trim())}`, { signal: controller.signal })
      .then((r) => r.json()).then((data) => setMemberResults((data.users ?? []).filter((u: PublicUser) => !group.members.some((m) => m.id === u.id))))
      .catch(() => undefined), 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [memberQuery, group]);

  async function groupAction(url: string, method: "POST" | "PATCH" | "DELETE", body?: object) {
    setGroupBusy(url);
    const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    if (response.ok) {
      if (url.endsWith("/leave")) { router.push("/app/chats"); router.refresh(); return; }
      const refreshed = await fetch(`/api/conversations/${conversationId}`, { cache: "no-store" });
      if (refreshed.ok) setGroup((await refreshed.json()).conversation);
    } else {
      const data = await response.json().catch(() => null); setError(data?.error ?? "That group action failed.");
    }
    setGroupBusy(null);
  }

  async function toggleNotifications() {
    setGroupBusy("notifications");
    const response = await fetch(`/api/conversations/${conversationId}/controls`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: muted ? "unmute" : "mute" }) });
    if (response.ok) { setMuted((value) => !value); router.refresh(); }
    else setError("Notification settings could not be changed.");
    setGroupBusy(null);
  }

  async function toggleBlock() {
    if (!other) return;
    setGroupBusy("block");
    const response = await fetch(`/api/users/${other.id}/block`, { method: blocked ? "DELETE" : "POST" });
    if (response.ok) { setBlocked((value) => !value); router.refresh(); }
    else setError("Block settings could not be changed.");
    setGroupBusy(null);
  }

  useEffect(() => {
    return subscribe((event) => {
      if (
        "conversationId" in event &&
        event.conversationId === conversationId &&
        (event.type === "message:new" ||
          event.type === "message:update" ||
          event.type === "message:deleted" ||
          event.type === "message:deleted_for_me")
      ) {
        setLoading(true);
        setRevision((value) => value + 1);
      }
    });
  }, [conversationId, subscribe]);

  // Load data for current tab
  useEffect(() => {
    const controller = new AbortController();
    const url = tab === "starred" ? "/api/users/me/starred-messages" : `/api/conversations/${conversationId}/${tab === "pinned" ? "pinned-messages" : tab}`;
    fetch(url, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("request_failed");
        return response.json();
      })
      .then((data) => {
        if (tab === "media") setMedia(data.media ?? []);
        else if (tab === "files") setFiles(data.files ?? []);
        else if (tab === "pinned") setSavedMessages(data.pins ?? []);
        else setSavedMessages((data.starred ?? []).filter((item: SavedMessageItem) => item.conversation?.id === conversationId));
        setError(null);
      })
      .catch((cause) => {
        if ((cause as Error).name !== "AbortError") {
          setError("Shared items could not be loaded.");
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [conversationId, tab, revision, localRevision]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[80] bg-black/30 backdrop-blur-sm lg:hidden"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-[90] flex w-full max-w-sm flex-col bg-[var(--surface)] border-l border-[var(--border)] shadow-xl",
          "animate-slide-in-right",
          "lg:relative lg:z-auto lg:w-80 lg:shadow-none",
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center gap-3 border-b border-[var(--border)] px-4">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--muted)_12%,transparent)]"
          >
            <X className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold">{group.type === "group" ? "Group info" : "Chat info"}</span>
        </div>

        {/* Profile summary */}
        {group.type === "group" ? (
          <div className="border-b border-[var(--border)] px-4 py-5">
            <div className="flex flex-col items-center gap-2">
              {group.avatarUrl ? <img src={group.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" /> : <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-soft)]"><Users className="h-7 w-7 text-[var(--accent-fg)]" /></span>}
              <span className="text-base font-semibold">{group.name}</span>
              <span className="text-xs text-[var(--muted)]">{group.members.length} members · {group.members.filter((m) => m.role === "owner" || m.role === "admin").length} admins</span>
              {group.description ? <p className="text-center text-xs text-[var(--muted)]">{group.description}</p> : null}
            </div>
            <div className="mt-4 max-h-52 space-y-1 overflow-y-auto">
              {group.members.map((member) => <div key={member.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-[var(--surface-2)]">
                <Avatar user={member} size={32} /><span className="min-w-0 flex-1"><b className="block truncate text-xs">{member.displayName}</b><small className="text-[var(--muted)]">{member.role}</small></span>
                {group.myRole === "owner" && member.role !== "owner" ? <>
                  <button type="button" disabled={groupBusy !== null} title={member.role === "admin" ? "Demote admin" : "Promote to admin"} onClick={() => void groupAction(`/api/groups/${conversationId}/members/${member.id}`, "PATCH", { role: member.role === "admin" ? "member" : "admin" })} className="p-1.5 text-[var(--muted)]">{member.role === "admin" ? <ShieldOff className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}</button>
                  <button type="button" disabled={groupBusy !== null} title="Transfer ownership" onClick={() => void groupAction(`/api/groups/${conversationId}/transfer`, "POST", { userId: member.id })} className="p-1.5 text-[var(--muted)]"><Users className="h-3.5 w-3.5" /></button>
                </> : null}
                {(group.myRole === "owner" || group.myRole === "admin") && member.role === "member" ? <button type="button" disabled={groupBusy !== null} title="Remove member" onClick={() => void groupAction(`/api/groups/${conversationId}/members/${member.id}`, "DELETE")} className="p-1.5 text-[var(--danger)]"><Trash2 className="h-3.5 w-3.5" /></button> : null}
              </div>)}
            </div>
            {group.myRole === "owner" || group.myRole === "admin" ? <div className="mt-3">
              <div className="relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" /><input value={memberQuery} onChange={(e) => { setMemberQuery(e.target.value); if (e.target.value.trim().length < 2) setMemberResults([]); }} className="field-input field-input--icon py-2! text-xs!" placeholder="Add members…" /></div>
              {memberResults.length ? <div className="mt-1 max-h-28 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">{memberResults.map((member) => <button type="button" key={member.id} onClick={() => void groupAction(`/api/groups/${conversationId}/members`, "POST", { userId: member.id }).then(() => { setMemberQuery(""); setMemberResults([]); })} className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-xs hover:bg-[var(--surface-2)]"><Avatar user={member} size={26} /><span className="min-w-0 flex-1 truncate">{member.displayName}</span><UserPlus className="h-3.5 w-3.5" /></button>)}</div> : null}
            </div> : null}
            <button type="button" disabled={groupBusy !== null} onClick={() => void groupAction(`/api/groups/${conversationId}/leave`, "POST")} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_8%,transparent)]"><LogOut className="h-4 w-4" />Leave group</button>
          </div>
        ) : other ? (
          <div className="flex flex-col items-center gap-2 border-b border-[var(--border)] px-4 py-5">
            <Avatar user={other} size={64} />
            <span className="text-base font-semibold">{other.displayName}</span>
            <span className="text-xs text-[var(--muted)]">@{other.username}</span>
            {other.bio ? (
              <p className="mt-1 max-w-[14rem] text-center text-xs leading-relaxed text-[var(--muted)]">
                {other.bio}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)]">
          {(["media", "files", "pinned", "starred"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setLoading(true);
                setTab(t);
              }}
              className={cn(
                "flex-1 py-2.5 text-xs font-medium capitalize transition-colors",
                tab === t
                  ? "border-b-2 border-[var(--accent)] text-[var(--accent-fg)]"
                  : "text-[var(--muted)] hover:text-[var(--text)]",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--muted)]" />
            </div>
          ) : error ? (
            <div className="py-10 text-center text-xs text-[var(--muted)]">
              {error}
            </div>
          ) : tab === "media" ? (
            <MediaGrid items={media} />
          ) : tab === "files" ? (
            <FilesList items={files} />
          ) : (
            <SavedMessagesList items={savedMessages} icon={tab === "pinned" ? "pinned" : "starred"} />
          )}
        </div>
        <div className="border-t border-[var(--border)] p-3">
          <button type="button" disabled={groupBusy !== null} onClick={() => void toggleNotifications()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--surface-2)]">
            {muted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}<span className="flex-1">Notifications</span><small className="text-[var(--muted)]">{muted ? "Muted" : "On"}</small>
          </button>
          {other ? <button type="button" disabled={groupBusy !== null} onClick={() => void toggleBlock()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_8%,transparent)]"><Ban className="h-4 w-4" />{blocked ? `Unblock ${other.displayName.split(" ")[0]}` : `Block ${other.displayName.split(" ")[0]}`}</button> : null}
        </div>
      </div>
    </>
  );
}

function SavedMessagesList({ items, icon }: { items: SavedMessageItem[]; icon: "pinned" | "starred" }) {
  const Icon = icon === "pinned" ? Pin : Star;
  if (!items.length) return <div className="flex flex-col items-center py-10 text-center"><Icon className="h-8 w-8 text-[var(--muted)] opacity-40" /><p className="mt-3 text-xs text-[var(--muted)]">No {icon} messages</p></div>;
  return <div className="space-y-2">{items.map((item) => <a key={item.messageId} href={`?message=${item.messageId}`} className="block rounded-xl border border-[var(--border)] p-3 hover:bg-[var(--surface-2)]"><div className="flex items-center gap-2 text-xs font-semibold"><Icon className="h-3.5 w-3.5" />{item.sender.displayName}</div><p className="mt-1 line-clamp-3 text-xs text-[var(--muted)]">{item.text || "Attachment"}</p></a>)}</div>;
}

/* =============================== Media Grid =============================== */

function MediaGrid({ items }: { items: AttachmentDTO[] }) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <ImageIcon className="h-8 w-8 text-[var(--muted)] opacity-40" />
        <p className="mt-3 text-xs text-[var(--muted)]">No media shared yet</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-1.5">
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setLightboxIdx(i)}
            className="group relative aspect-square overflow-hidden rounded-xl"
          >
            <InlineMedia attachment={item} gallery />
            <span className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
            {item.kind === "video" ? (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <Play className="h-7 w-7 fill-white text-white drop-shadow" />
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {lightboxIdx !== null ? (
        <Lightbox
          src={items[lightboxIdx].url}
          alt={items[lightboxIdx].originalName}
          images={items}
          currentIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onNavigate={(idx) => setLightboxIdx(idx)}
        />
      ) : null}
    </>
  );
}

/* =============================== Files List =============================== */

function iconFor(mime: string) {
  if (mime.includes("pdf")) return FileText;
  if (mime.includes("zip")) return FileArchive;
  if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv"))
    return FileSpreadsheet;
  if (mime.startsWith("text/")) return FileText;
  return FileIcon;
}

function FilesList({
  items,
}: {
  items: (AttachmentDTO & { createdAt: string })[];
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <FileIcon className="h-8 w-8 text-[var(--muted)] opacity-40" />
        <p className="mt-3 text-xs text-[var(--muted)]">No files shared yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {items.map((item) => {
        const Icon = iconFor(item.mimeType);
        return (
          <a
            key={item.id}
            href={item.url}
            download={item.originalName}
            className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 transition-colors hover:border-[var(--border-strong)]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]">
              <Icon className="h-4.5 w-4.5 text-[var(--accent-fg)]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">
                {item.originalName}
              </span>
              <span className="block text-[0.68rem] text-[var(--muted)]">
                {humanSize(item.size)} · {formatDate(item.createdAt)}
              </span>
            </span>
            <Download className="h-4 w-4 shrink-0 text-[var(--muted)]" />
          </a>
        );
      })}
    </div>
  );
}

/* =============================== Helpers =============================== */

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en", { weekday: "short" });
  return d.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}
