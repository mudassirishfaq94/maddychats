"use client";

import { useEffect, useRef, useState } from "react";
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
  AlertTriangle,
  Dices,
} from "lucide-react";
import type { AttachmentDTO, ConversationDetail, PublicUser } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { InlineMedia, Lightbox, humanSize } from "./attachments";
import { useEncryptedAttachmentUrl } from "./e2ee-context";
import { useRealtime } from "@/components/providers/realtime-provider";
import { CHAT_BACKGROUNDS, isBackgroundImage } from "@/lib/chat-backgrounds";
import { cn } from "@/lib/utils";
import { Toggle } from "@/components/ui/toggle";

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
  const [inviteLinks, setInviteLinks] = useState<Array<{ id: string; code: string; url?: string; useCount: number; maxUses: number | null; expiresAt: Date | null }>>([]);
  const [showInviteLinks, setShowInviteLinks] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const router = useRouter();
  const { subscribe } = useRealtime();

  useEffect(() => {
    if (group.type !== "group" || memberQuery.trim().length < 3) return;
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

  async function changeBackground(
    backgroundStyle: string | null | File | undefined,
    backgroundOpacity?: number,
    position?: { x: number; y: number },
  ) {
    setGroupBusy("background");
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      if (backgroundStyle !== undefined) payload.backgroundStyle = backgroundStyle;
      if (backgroundOpacity !== undefined) payload.backgroundOpacity = backgroundOpacity;
      if (position !== undefined) {
        payload.backgroundPositionX = position.x;
        payload.backgroundPositionY = position.y;
      }
      const form = backgroundStyle instanceof File ? new FormData() : null;
      if (form && backgroundStyle instanceof File) form.append("file", backgroundStyle);
      const response = await fetch(`/api/conversations/${conversationId}/background`, {
        method: "PATCH",
        headers: form ? undefined : { "Content-Type": "application/json" },
        body: form ?? JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });
      const result = await response.json().catch(() => null);
      if (response.ok) {
        setGroup((prev) => ({
          ...prev,
          ...(backgroundStyle !== undefined ? { backgroundStyle: result.backgroundStyle } : {}),
          ...(result.backgroundOpacity !== null ? { backgroundOpacity: result.backgroundOpacity } : {}),
          ...(result.backgroundPositionX !== null ? { backgroundPositionX: result.backgroundPositionX } : {}),
          ...(result.backgroundPositionY !== null ? { backgroundPositionY: result.backgroundPositionY } : {}),
        }));
        router.refresh();
      } else {
        setError(result?.error ?? "Background could not be changed.");
      }
    } catch {
      setError("Network error while changing background.");
    } finally {
      setGroupBusy(null);
    }
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

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
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
            {(group.myRole === "owner" || group.myRole === "admin") ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => {
                    const next = !showInviteLinks;
                    setShowInviteLinks(next);
                    if (next && inviteLinks.length === 0) {
                      fetch(`/api/groups/${conversationId}/invites`)
                        .then((r) => {
                          if (!r.ok) throw new Error("Failed to load invite links");
                          return r.json();
                        })
                        .then((data) => setInviteLinks(data.links ?? []))
                        .catch((err) => setError(err.message || "Could not load invite links. Make sure the database migration has been applied."));
                    }
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-soft)]"
                >
                  <span className="text-lg">🔗</span>
                  {showInviteLinks ? "Hide" : "Invite links"}
                </button>
                {showInviteLinks ? (
                  <div className="mt-2 space-y-2">
                    <button
                      type="button"
                      disabled={groupBusy !== null}
                      onClick={async () => {
                        setGroupBusy("invite");
                        try {
                          const res = await fetch(`/api/groups/${conversationId}/invites`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({}),
                          });
                          if (!res.ok) {
                            const data = await res.json().catch(() => null);
                            throw new Error(data?.error || `Server error ${res.status}`);
                          }
                          const data = await res.json();
                          if (data.link) {
                            setInviteLinks((prev) => [data.link, ...prev]);
                          }
                        } catch (err) {
                          setError((err as Error).message || "Failed to create invite link.");
                        }
                        setGroupBusy(null);
                      }}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--accent)] py-2 text-[0.68rem] font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-soft)]"
                    >
                      + Create invite link
                    </button>
                    {inviteLinks.map((link) => (
                      <div key={link.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="truncate text-[0.65rem] font-mono text-[var(--muted)]">
                            {`${typeof window !== 'undefined' ? window.location.origin : ''}/invite/${link.code}`}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/invite/${link.code}`;
                              navigator.clipboard?.writeText(url);
                              setCopiedLink(true);
                              setTimeout(() => setCopiedLink(false), 1500);
                            }}
                            className="shrink-0 rounded px-2 py-0.5 text-[0.6rem] font-medium text-[var(--accent)]"
                          >
                            {copiedLink ? "✓" : "Copy"}
                          </button>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[0.6rem] text-[var(--muted)]">
                          <span>Used {link.useCount}{link.maxUses ? `/${link.maxUses}` : ''} times</span>
                          {link.expiresAt ? <span>· Expires {new Date(link.expiresAt).toLocaleDateString()}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {(group.myRole === "owner" || group.myRole === "admin") ? (
              <GroupSettingsPanel
                conversationId={conversationId}
                group={group}
                busy={groupBusy !== null}
                onUpdate={(patch) => setGroup((prev) => ({ ...prev, ...patch }))}
              />
            ) : null}
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
        <div className="p-3">
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
          <p className="mb-2 text-xs font-medium text-[var(--muted)]">Chat Background</p>
          <div className="grid grid-cols-4 gap-2">
            {CHAT_BACKGROUNDS.map((bg) => (
              <button
                key={bg.key}
                type="button"
                disabled={groupBusy !== null}
                onClick={() => void changeBackground(bg.key === "default" ? null : bg.key)}
                className={cn(
                  "flex h-10 items-center justify-center rounded-lg text-[0.65rem] font-medium text-white transition-transform hover:scale-105",
                  group.backgroundStyle === bg.key || (!group.backgroundStyle && bg.key === "default")
                    ? "ring-2 ring-[var(--accent)] ring-offset-1"
                    : "",
                )}
                style={{ background: bg.color, color: bg.ink }}
                title={bg.label}
              >
                {bg.label}
              </button>
            ))}
          </div>
          <CustomBackgroundInput
            currentBg={group.backgroundStyle}
            currentOpacity={group.backgroundOpacity ?? 100}
            currentPosition={{ x: group.backgroundPositionX ?? 50, y: group.backgroundPositionY ?? 50 }}
            busy={groupBusy !== null}
            onChange={changeBackground}
            onOpacityChange={(opacity) => changeBackground(undefined, opacity)}
            onChangeBoth={(bg, opacity) => changeBackground(bg, opacity)}
            onPositionChange={(x, y) => changeBackground(undefined, undefined, { x, y })}
          />
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <button type="button" disabled={groupBusy !== null} onClick={() => void toggleNotifications()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--surface-2)]">
              {muted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}<span className="flex-1">Notifications</span><small className="text-[var(--muted)]">{muted ? "Muted" : "On"}</small>
            </button>
            {other ? <button type="button" disabled={groupBusy !== null} onClick={() => void toggleBlock()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_8%,transparent)]"><Ban className="h-4 w-4" />{blocked ? `Unblock ${other.displayName.split(" ")[0]}` : `Block ${other.displayName.split(" ")[0]}`}</button> : null}           </div>
         </div>
        </div>{/* end scrollable body */}
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
      {items.map((item) => (
        <DetailsFileChip key={item.id} item={item} />
      ))}
    </div>
  );
}

function DetailsFileChip({
  item,
}: {
  item: AttachmentDTO & { createdAt: string };
}) {
  const { url, failed } = useEncryptedAttachmentUrl(item);
  const fileIcon = (() => {
    const props = { className: "h-4.5 w-4.5 text-[var(--accent-fg)]" };
    if (item.mimeType.includes("pdf") || item.mimeType.startsWith("text/")) return <FileText {...props} />;
    if (item.mimeType.includes("zip")) return <FileArchive {...props} />;
    if (item.mimeType.includes("spreadsheet") || item.mimeType.includes("excel")) return <FileSpreadsheet {...props} />;
    return <FileIcon {...props} />;
  })();
  const unavailable = Boolean(item.encrypted && (failed || !url));
  return (
    <span className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]">
        {fileIcon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold">
          {item.originalName}
        </span>
        <span className="block text-[0.68rem] text-[var(--muted)]">
          {unavailable
            ? "Locked — could not decrypt"
            : `${humanSize(item.size)} · ${formatDate(item.createdAt)}`}
        </span>
      </span>
      {!unavailable ? (
        <a
          href={url ?? undefined}
          download={item.originalName}
          aria-label={`Download ${item.originalName}`}
          className="text-[var(--muted)] hover:text-[var(--text)]"
        >
          <Download className="h-4 w-4 shrink-0" />
        </a>
      ) : (
        <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--muted)]" />
      )}
    </span>
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

/* =================== Custom Background Input =================== */

import {
  CHAT_PATTERNS,
  DOODLE_SETS,
  DOODLE_PRESETS,
  randomDoodleStyle,
  isPatternId,
  parseDoodleStyle,
  encodeDoodleStyleString,
  buildDoodleBackground,
  DEFAULT_DOODLE_STYLE_STRING,
  type DoodleStyle,
} from "@/lib/chat-patterns";

const PRESET_COLORS = [
  { color: "#e7f0df", label: "Sage" },
  { color: "#ffedd5", label: "Peach" },
  { color: "#e0f2fe", label: "Sky" },
  { color: "#f3e8ff", label: "Lilac" },
  { color: "#faf3e0", label: "Sand" },
  { color: "#fecdd3", label: "Blush" },
  { color: "#d1fae5", label: "Seafoam" },
  { color: "#fef3c7", label: "Butter" },
  { color: "#cbd5e1", label: "Silver" },
  { color: "#115e59", label: "Teal" },
  { color: "#831843", label: "Berry" },
  { color: "#573b2e", label: "Espresso" },
  { color: "#1a1a2e", label: "Dark Blue" },
  { color: "#16213e", label: "Navy" },
  { color: "#0f3460", label: "Royal Blue" },
  { color: "#533483", label: "Purple" },
  { color: "#2d132c", label: "Deep Purple" },
  { color: "#1b1b2f", label: "Midnight" },
  { color: "#162447", label: "Ocean Dark" },
  { color: "#1f4068", label: "Steel" },
  { color: "#4a0e0e", label: "Dark Red" },
  { color: "#1a3c34", label: "Forest Dark" },
  { color: "#2b2b2b", label: "Slate" },
  { color: "#1e1e1e", label: "Ash" },
];

function CustomBackgroundInput({
  currentBg,
  currentOpacity,
  currentPosition,
  busy,
  onChange,
  onOpacityChange,
  onChangeBoth,
  onPositionChange,
}: {
  currentBg: string | null;
  currentOpacity: number;
  currentPosition: { x: number; y: number };
  busy: boolean;
  onChange: (bg: string | null) => Promise<void>;
  onOpacityChange: (opacity: number) => Promise<void>;
  onChangeBoth: (bg: string | null | File, opacity: number) => Promise<void>;
  onPositionChange: (x: number, y: number) => Promise<void>;
}) {
  const [mode, setMode] = useState<"image" | "color" | "gradient" | "pattern" | "doodles">("image");
  const [urlInput, setUrlInput] = useState("");
  const [colorInput, setColorInput] = useState("#1a1a2e");
  const [gradientStart, setGradientStart] = useState("#667eea");
  const [gradientEnd, setGradientEnd] = useState("#764ba2");
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [intensity, setIntensity] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const PRESETS = CHAT_BACKGROUNDS.map((p) => p.key);
  const isCustom = currentBg && !PRESETS.includes(currentBg);
  const showOpacity = currentBg && currentBg !== "default";
  const isImageBg = !!currentBg && isBackgroundImage(currentBg);
  const pos = dragPos ?? currentPosition;

  async function applyUrl() {
    if (busy || uploading) return;
    setImageError(null);
    setUploading(true);
    try {
      const url = new URL(urlInput.trim());
      if (url.protocol !== "https:") throw new Error("Use a direct HTTPS image link.");
      await new Promise<void>((resolve, reject) => {
        const img = new window.Image();
        const timer = setTimeout(() => { img.src = ""; reject(new Error("The image took too long to load. Try another link or upload it.")); }, 15000);
        img.onload = () => { clearTimeout(timer); resolve(); };
        img.onerror = () => { clearTimeout(timer); reject(new Error("This link does not load an image. Use a direct image link or upload from your device.")); };
        img.referrerPolicy = "no-referrer";
        img.src = url.href;
      });
      await onChangeBoth(url.href, 100);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Could not load that image.");
    } finally { setUploading(false); }
  }

  function applyColor() {
    onChange(colorInput);
  }

  function applyGradient() {
    onChange(`linear-gradient(135deg, ${gradientStart}, ${gradientEnd})`);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busy || uploading) return;
    setUploading(true);
    setImageError(null);
    let objectUrl: string | undefined;
    try {
      if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
      if (file.size > 20 * 1024 * 1024) throw new Error("Choose an image smaller than 20 MB.");
      objectUrl = URL.createObjectURL(file);
      const image = new window.Image();
      image.src = objectUrl;
      await image.decode();
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image resizing is unavailable in this browser.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not prepare this image.")), "image/webp", 0.82));
      if (blob.size > 2 * 1024 * 1024) throw new Error("This image is too detailed. Try a smaller image.");
      await onChangeBoth(new File([blob], blob.type === "image/png" ? "background.png" : "background.webp", { type: blob.type }), 100);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Could not open this image. Try JPG, PNG, or WebP.");
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUploading(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <div className="mb-2.5 flex gap-1">
        {(["doodles", "pattern", "image", "color", "gradient"] as const).map((m) => (
          <button
            key={m}
            type="button"
            disabled={busy}
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 rounded-lg py-1.5 text-[0.65rem] font-medium capitalize transition-colors",
              mode === m
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--muted)] hover:bg-[var(--surface)]",
            )}
          >
            {m === "image" ? "Image" : m === "color" ? "Color" : m === "gradient" ? "Gradient" : m === "doodles" ? "Doodles" : "Pattern"}
          </button>
        ))}
      </div>

      {mode === "doodles" ? (
        <DoodleCustomizer
          currentBg={currentBg}
          busy={busy}
          onChangeBoth={onChangeBoth}
        />
      ) : null}

      {mode === "pattern" ? (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-1.5">
            {CHAT_PATTERNS.map((pat) => (
              <button
                key={pat.id}
                type="button"
                disabled={busy}
                onClick={() => onChangeBoth(pat.id, 20)}
                className={cn(
                  "relative h-12 overflow-hidden rounded-lg border-2 transition-transform hover:scale-105",
                  currentBg === pat.id ? "border-[var(--accent)]" : "border-transparent",
                )}
                style={{
                  background: pat.background(0.3),
                  backgroundColor: pat.baseColor,
                }}
                title={pat.label}
              />
            ))}
          </div>
        </div>
      ) : mode === "image" ? (
        <div className="space-y-2">
          <div className="flex gap-1.5">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Paste image URL..."
              className="field-input flex-1 py-1.5! text-xs!"
              onKeyDown={(e) => { if (e.key === "Enter") applyUrl(); }}
            />
            <button
              type="button"
              disabled={busy || uploading || !urlInput.trim()}
              onClick={applyUrl}
              className="btn btn-primary px-2.5! py-1.5! text-xs!"
            >
              Apply
            </button>
          </div>
          <button
            type="button"
            disabled={busy || uploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] py-2 text-[0.68rem] text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-fg)]"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            {uploading ? "Uploading..." : "Upload from device"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            className="hidden"
            onChange={handleFileUpload}
          />
          {isImageBg ? (
            <DraggableBackgroundPreview
              src={currentBg!}
              opacity={(intensity ?? currentOpacity) / 100}
              position={pos}
              onPositionChange={(x, y) => setDragPos({ x, y })}
              onCommit={(x, y) => {
                setDragPos(null);
                void onPositionChange(x, y);
              }}
            />
          ) : null}
        </div>
      ) : mode === "color" ? (
        <div className="space-y-2">
          <div className="flex gap-1.5">
            <input
              type="color"
              value={colorInput}
              onChange={(e) => setColorInput(e.target.value)}
              className="h-8 w-8 cursor-pointer rounded-lg border border-[var(--border)]"
            />
            <input
              type="text"
              value={colorInput}
              onChange={(e) => setColorInput(e.target.value)}
              placeholder="#1a1a2e"
              className="field-input flex-1 py-1.5! text-xs!"
            />
            <button
              type="button"
              disabled={busy}
              onClick={applyColor}
              className="btn btn-primary px-2.5! py-1.5! text-xs!"
            >
              Apply
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c.color + c.label}
                type="button"
                disabled={busy}
                onClick={() => { setColorInput(c.color); onChange(c.color); }}
                className={cn(
                  "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110",
                  currentBg === c.color ? "border-[var(--accent)]" : "border-transparent",
                )}
                style={{ background: c.color }}
                title={c.label}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-1.5">
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={gradientStart}
                onChange={(e) => setGradientStart(e.target.value)}
                className="h-7 w-7 cursor-pointer rounded-lg border border-[var(--border)]"
              />
              <span className="text-[0.6rem] text-[var(--muted)]">Start</span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={gradientEnd}
                onChange={(e) => setGradientEnd(e.target.value)}
                className="h-7 w-7 cursor-pointer rounded-lg border border-[var(--border)]"
              />
              <span className="text-[0.6rem] text-[var(--muted)]">End</span>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={applyGradient}
              className="btn btn-primary px-2.5! py-1.5! text-xs!"
            >
              Apply
            </button>
          </div>
          <div
            className="h-8 w-full rounded-lg"
            style={{ background: `linear-gradient(135deg, ${gradientStart}, ${gradientEnd})` }}
          />
        </div>
      )}

      {imageError ? <p role="alert" className="mt-2 text-xs text-[var(--danger)]">{imageError}</p> : null}
      {/* Opacity slider */}
      {showOpacity ? (
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[0.65rem] font-medium text-[var(--muted)]">Background Intensity</span>
            <span className="text-[0.65rem] tabular-nums text-[var(--accent-fg)]">{intensity ?? currentOpacity}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={intensity ?? currentOpacity}
            disabled={busy || uploading}
            aria-label="Background intensity"
            onChange={(e) => setIntensity(Number(e.target.value))}
            onPointerUp={(e) => { void onOpacityChange(Number(e.currentTarget.value)).finally(() => setIntensity(null)); }}
            onKeyUp={(e) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key)) void onOpacityChange(Number(e.currentTarget.value)).finally(() => setIntensity(null)); }}
            className="w-full accent-[var(--accent)]"
          />
          <div className="mt-1 flex justify-between text-[0.55rem] text-[var(--muted)]">
            <span>Hidden</span>
            <span>Full</span>
          </div>
        </div>
      ) : null}

      {isCustom ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => { void onChangeBoth(null, 100); }}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[0.65rem] text-[var(--danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_8%,transparent)]"
        >
          <X className="h-3 w-3" />
          Remove custom background
        </button>
      ) : null}
    </div>
  );
}

/* ================= Doodle Customizer ================= */

const DOODLE_INK_PRESETS = ["#ffffff", "#22d3ee", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#f87171", "#94a3b8"];
const DOODLE_BASE_PRESETS = [
  { color: "#1b2a38", label: "Deep sea" },
  { color: "#101828", label: "Ink" },
  { color: "#3b0764", label: "Grape" },
  { color: "#134e4a", label: "Pine" },
  { color: "#431407", label: "Cocoa" },
  { color: "#4c1d95", label: "Violet" },
  { color: "#0c334b", label: "Lake" },
  { color: "#463625", label: "Sandstone" },
];

function DoodleCustomizer({
  currentBg,
  busy,
  onChangeBoth,
}: {
  currentBg: string | null;
  busy: boolean;
  onChangeBoth: (bg: string | null | File, opacity: number) => Promise<void>;
}) {
  const parsed = parseDoodleStyle(currentBg);
  const [style, setStyle] = useState<DoodleStyle>(
    parsed ?? { setIds: ["all"], inkColor: "#ffffff", baseColor: "#1b2a38", size: 1 },
  );
  const [saved, setSaved] = useState(false);
  const dirty = encodeDoodleStyleString(style) !== (parsed ? encodeDoodleStyleString(parsed) : DEFAULT_DOODLE_STYLE_STRING);

  function update(patch: Partial<DoodleStyle>) {
    setStyle((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  }

  function toggleSet(setId: string) {
    const isActive = style.setIds.includes("all") || style.setIds.includes(setId);
    let next: string[];
    if (style.setIds.includes("all")) {
      // Deselecting from "all" starts with all other sets selected.
      next = DOODLE_SETS.map((s) => s.id).filter((id) => id !== setId);
    } else if (isActive) {
      next = style.setIds.filter((id) => id !== setId);
      if (next.length === 0) next = ["all"];
    } else {
      next = [...style.setIds, setId];
      if (next.length === DOODLE_SETS.length) next = ["all"];
    }
    update({ setIds: next });
  }

  const previewBg = buildDoodleBackground(style, 0.85);

  async function applyPreset(preset: (typeof DOODLE_PRESETS)[number]) {
    setStyle(preset.style);
    await onChangeBoth(encodeDoodleStyleString(preset.style), 100);
    setSaved(true);
  }

  async function applyShuffled() {
    const next = randomDoodleStyle();
    setStyle(next);
    await onChangeBoth(encodeDoodleStyleString(next), 100);
    setSaved(true);
  }

  return (
    <div className="space-y-2.5">
      {/* Curated one-tap themes */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[0.65rem] font-medium text-[var(--muted)]">Themes</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void applyShuffled()}
            className="flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[0.65rem] font-medium text-[var(--muted)] transition-colors hover:text-[var(--text)] disabled:opacity-50"
            title="Generate a random tasteful doodle style"
          >
            <Dices className="h-3 w-3" />
            Shuffle
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {DOODLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={busy}
              onClick={() => void applyPreset(preset)}
              title={preset.label}
              className={cn(
                "group flex flex-col items-center gap-1 rounded-lg border p-1 transition-colors",
                encodeDoodleStyleString(preset.style) === (parsed ? encodeDoodleStyleString(parsed) : null)
                  ? "border-[var(--accent)]"
                  : "border-[var(--border)] hover:border-[var(--border-strong)]",
              )}
            >
              <span
                aria-hidden="true"
                className="h-6 w-full rounded"
                style={{
                  backgroundColor: preset.style.baseColor,
                  backgroundImage: buildDoodleBackground(preset.style, 0.9),
                  backgroundRepeat: "repeat",
                  backgroundSize: "auto",
                }}
              />
              <span className="w-full truncate text-center text-[0.55rem] leading-tight text-[var(--muted)] group-hover:text-[var(--text)]">
                {preset.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Live preview */}
      <div
        aria-hidden="true"
        className="relative h-20 w-full overflow-hidden rounded-xl border border-[var(--border)]"
        style={{ backgroundColor: style.baseColor }}
      >
        <div className="absolute inset-0" style={{ backgroundImage: previewBg, backgroundRepeat: "repeat", backgroundSize: "auto" }} />
        <div aria-hidden="true" className="absolute inset-x-2 bottom-2 space-y-1">
          <div className="h-3 w-2/5 rounded-full bg-black/25" />
          <div className="ml-auto h-3 w-1/2 rounded-full bg-white/45" />
        </div>
      </div>

      {/* Doodle sets */}
      <div>
        <p className="mb-1 text-[0.65rem] font-medium text-[var(--muted)]">Which doodles</p>
        <div className="flex flex-wrap gap-1.5">
          {DOODLE_SETS.map((set) => {
            const active = style.setIds.includes("all") || style.setIds.includes(set.id);
            return (
              <button
                key={set.id}
                type="button"
                disabled={busy}
                onClick={() => toggleSet(set.id)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[0.65rem] font-medium transition-colors",
                  active
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)]",
                )}
              >
                {set.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Doodle (ink) color */}
      <div>
        <p className="mb-1 text-[0.65rem] font-medium text-[var(--muted)]">Doodle color</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {DOODLE_INK_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              disabled={busy}
              onClick={() => update({ inkColor: c })}
              className={cn(
                "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110",
                style.inkColor.toLowerCase() === c.toLowerCase() ? "border-[var(--accent)]" : "border-transparent",
              )}
              style={{ background: c }}
              title={c}
            />
          ))}
          <input
            type="color"
            value={style.inkColor}
            disabled={busy}
            onChange={(e) => update({ inkColor: e.target.value })}
            aria-label="Custom doodle color"
            className="h-6 w-8 cursor-pointer rounded border border-[var(--border)]"
          />
        </div>
      </div>

      {/* Base color */}
      <div>
        <p className="mb-1 text-[0.65rem] font-medium text-[var(--muted)]">Background color</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {DOODLE_BASE_PRESETS.map((c) => (
            <button
              key={c.color}
              type="button"
              disabled={busy}
              onClick={() => update({ baseColor: c.color })}
              className={cn(
                "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110",
                style.baseColor.toLowerCase() === c.color.toLowerCase() ? "border-[var(--accent)]" : "border-transparent",
              )}
              style={{ background: c.color }}
              title={c.label}
            />
          ))}
          <input
            type="color"
            value={style.baseColor}
            disabled={busy}
            onChange={(e) => update({ baseColor: e.target.value })}
            aria-label="Custom background color"
            className="h-6 w-8 cursor-pointer rounded border border-[var(--border)]"
          />
        </div>
      </div>

      {/* Doodle size */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[0.65rem] font-medium text-[var(--muted)]">Doodle size</span>
          <span className="text-[0.65rem] tabular-nums text-[var(--accent-fg)]">{style.size.toFixed(1)}×</span>
        </div>
        <input
          type="range"
          min={0.5}
          max={2.5}
          step={0.1}
          value={style.size}
          disabled={busy}
          aria-label="Doodle size"
          onChange={(e) => update({ size: Number(e.target.value) })}
          className="w-full accent-[var(--accent)]"
        />
        <div className="mt-0.5 flex justify-between text-[0.55rem] text-[var(--muted)]">
          <span>Small</span>
          <span>Large</span>
        </div>
      </div>

      {/* Apply / Reset */}
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={busy || !dirty}
          onClick={async () => {
            await onChangeBoth(encodeDoodleStyleString(style), 100);
            setSaved(true);
          }}
          className="btn btn-primary flex-1 py-1.5! text-xs!"
        >
          Apply doodles
        </button>
        <button
          type="button"
          disabled={busy || !parsed}
          onClick={() => {
            setStyle({ setIds: ["all"], inkColor: "#ffffff", baseColor: "#1b2a38", size: 1 });
            setSaved(false);
            void onChangeBoth("doodles", 20);
          }}
          className="btn py-1.5! text-xs!"
        >
          Reset
          </button>
      </div>
      {saved ? <p className="text-center text-[0.65rem] text-[var(--accent-fg)]">Doodle background applied</p> : null}
    </div>
  );
}

/* ================= Draggable Background Preview ================= */

/**
 * Mini chat-screen preview with the custom image as background.
 * Drag the image (pointer events: mouse, touch, pen) to choose the focal
 * point; the position is committed on release.
 */
function DraggableBackgroundPreview({
  src,
  opacity,
  position,
  onPositionChange,
  onCommit,
}: {
  src: string;
  opacity: number;
  position: { x: number; y: number };
  onPositionChange: (x: number, y: number) => void;
  onCommit: (x: number, y: number) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    moved: boolean;
  } | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    try {
      frameRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // Capture is an optimization; dragging inside the frame works without it.
    }
    dragState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: position.x,
      baseY: position.y,
      moved: false,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    const frame = frameRef.current;
    if (!drag || !frame || drag.pointerId !== e.pointerId) return;
    const rect = frame.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dxPct = ((e.clientX - drag.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - drag.startY) / rect.height) * 100;
    if (Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) > 4) drag.moved = true;
    onPositionChange(clampPct(drag.baseX - dxPct), clampPct(drag.baseY - dyPct));
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragState.current = null;
    try {
      frameRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // Pointer may already be released; committing the position still matters.
    }
    if (drag.moved) onCommit(clampPct(position.x), clampPct(position.y));
  }

  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[0.65rem] font-medium text-[var(--muted)]">Image position</span>
        <span className="text-[0.6rem] text-[var(--muted)]">Drag to adjust</span>
      </div>
      <div
        ref={frameRef}
        role="slider"
        aria-label="Background image position"
        aria-valuetext={`${Math.round(position.x)}% horizontal, ${Math.round(position.y)}% vertical`}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 2;
          let next: { x: number; y: number } | null = null;
          if (e.key === "ArrowLeft") next = { x: clampPct(position.x - step), y: position.y };
          else if (e.key === "ArrowRight") next = { x: clampPct(position.x + step), y: position.y };
          else if (e.key === "ArrowUp") next = { x: position.x, y: clampPct(position.y - step) };
          else if (e.key === "ArrowDown") next = { x: position.x, y: clampPct(position.y + step) };
          if (next) {
            e.preventDefault();
            onPositionChange(next.x, next.y);
            frameRef.current?.focus();
          }
        }}
        onKeyUp={(e) => {
          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) onCommit(position.x, position.y);
        }}
        className="relative h-28 w-full cursor-grab touch-none select-none overflow-hidden rounded-xl border border-[var(--border)] active:cursor-grabbing"
      >
        {/* Dimmed base + the draggable image layer */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${JSON.stringify(src)})`,
            backgroundSize: "cover",
            backgroundPosition: `${position.x}% ${position.y}%`,
            opacity: Math.max(0.15, Math.min(1, opacity)),
          }}
        />
        {/* Focal-point crosshair */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
          style={{ left: `${position.x}%`, top: `${position.y}%` }}
        >
          <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90" />
        </div>
        {/* Fake message bubbles to hint at the real chat */}
        <div aria-hidden="true" className="absolute inset-x-2 bottom-2 space-y-1">
          <div className="h-3 w-2/5 rounded-full bg-black/25" />
          <div className="ml-auto h-3 w-1/2 rounded-full bg-white/45" />
        </div>
      </div>
    </div>
  );
}

function clampPct(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v)));
}

/* =================== Group Settings Panel =================== */

function GroupSettingsPanel({
  conversationId,
  group,
  busy,
  onUpdate,
}: {
  conversationId: string;
  group: { adminOnlyMessaging: boolean; rules: string | null; announcements: string | null; slowModeSeconds: number };
  busy: boolean;
  onUpdate: (patch: Record<string, unknown>) => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [rules, setRules] = useState(group.rules ?? "");
  const [announcements, setAnnouncements] = useState(group.announcements ?? "");
  const [slowMode, setSlowMode] = useState(group.slowModeSeconds);
  const [adminOnly, setAdminOnly] = useState(group.adminOnlyMessaging);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function saveSetting(patch: Record<string, unknown>) {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/groups/${conversationId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        onUpdate(patch);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {}
    setSaving(false);
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setShowSettings(!showSettings)}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-soft)]"
      >
        <span className="text-lg">⚙️</span>
        {showSettings ? "Hide settings" : "Group settings"}
        {saving && <Loader2 className="ml-auto h-3 w-3 animate-spin" />}
        {saved && !saving && <span className="ml-auto text-[var(--success)]">✓</span>}
      </button>

      {showSettings ? (
        <div className="mt-2 space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          {/* Admin-only messaging */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Admin-only messaging</span>
            <Toggle
              checked={adminOnly}
              onChange={(next) => {
                setAdminOnly(next);
                void saveSetting({ adminOnlyMessaging: next });
              }}
              disabled={busy}
              label="Admin-only messaging"
              size="small"
            />
          </div>

          {/* Slow mode */}
          <div>
            <span className="text-xs font-medium">Slow mode</span>
            <div className="mt-1.5 flex gap-1.5">
              {[0, 10, 30, 60, 300].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setSlowMode(sec);
                    void saveSetting({ slowModeSeconds: sec });
                  }}
                  className={`rounded-lg px-2 py-1 text-[0.6rem] font-medium transition-colors ${
                    slowMode === sec
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--surface)] text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--muted)_10%,transparent)]"
                  }`}
                >
                  {sec === 0 ? "Off" : sec < 60 ? `${sec}s` : `${sec / 60}m`}
                </button>
              ))}
            </div>
          </div>

          {/* Rules */}
          <div>
            <span className="text-xs font-medium">Group rules</span>
            <textarea
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              onBlur={() => {
                if (rules !== (group.rules ?? "")) {
                  void saveSetting({ rules: rules.trim() || null });
                }
              }}
              placeholder="e.g. Be respectful, no spam, English only..."
              rows={3}
              className="mt-1.5 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none"
            />
          </div>

          {/* Announcements */}
          <div>
            <span className="text-xs font-medium">Announcements</span>
            <textarea
              value={announcements}
              onChange={(e) => setAnnouncements(e.target.value)}
              onBlur={() => {
                if (announcements !== (group.announcements ?? "")) {
                  void saveSetting({ announcements: announcements.trim() || null });
                }
              }}
              placeholder="Pin important messages for all members..."
              rows={2}
              className="mt-1.5 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
