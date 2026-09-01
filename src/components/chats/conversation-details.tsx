"use client";

import { useEffect, useState } from "react";
import {
  Download,
  FileArchive,
  FileSpreadsheet,
  FileText,
  File as FileIcon,
  Image as ImageIcon,
  Link,
  Loader2,
  Play,
  X,
} from "lucide-react";
import type { AttachmentDTO, PublicUser } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { InlineMedia, Lightbox, humanSize } from "./attachments";
import { useRealtime } from "@/components/providers/realtime-provider";
import { cn } from "@/lib/utils";

type Tab = "media" | "files" | "links";

interface SharedLinkItem {
  messageId: string;
  url: string;
  text: string;
  createdAt: string;
  sender: PublicUser;
}

/** Slide-in panel showing conversation details + shared media/files/links. */
export function ConversationDetails({
  conversationId,
  other,
  localRevision = 0,
  onClose,
}: {
  conversationId: string;
  other: PublicUser | null;
  localRevision?: number;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("media");
  const [media, setMedia] = useState<AttachmentDTO[]>([]);
  const [files, setFiles] = useState<(AttachmentDTO & { createdAt: string })[]>(
    [],
  );
  const [links, setLinks] = useState<SharedLinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const { subscribe } = useRealtime();

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
    const endpoint =
      tab === "media"
        ? "media"
        : tab === "files"
          ? "files"
          : "links";
    fetch(`/api/conversations/${conversationId}/${endpoint}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("request_failed");
        return response.json();
      })
      .then((data) => {
        if (tab === "media") setMedia(data.media ?? []);
        else if (tab === "files") setFiles(data.files ?? []);
        else setLinks(data.links ?? []);
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
          <span className="text-sm font-semibold">Chat info</span>
        </div>

        {/* Profile summary */}
        {other ? (
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
          {(["media", "files", "links"] as const).map((t) => (
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
            <LinksList items={links} />
          )}
        </div>
      </div>
    </>
  );
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

/* =============================== Links List =============================== */

function LinksList({ items }: { items: SharedLinkItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <Link className="h-8 w-8 text-[var(--muted)] opacity-40" />
        <p className="mt-3 text-xs text-[var(--muted)]">No links shared yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => {
        let hostname = "";
        try {
          hostname = new URL(item.url).hostname;
        } catch {
          hostname = item.url;
        }
        return (
          <a
            key={`${item.messageId}-${i}`}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col gap-0.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 transition-colors hover:border-[var(--border-strong)]"
          >
            <span className="truncate text-xs font-semibold text-[var(--accent-fg)]">
              {item.url}
            </span>
            <span className="truncate text-[0.68rem] text-[var(--muted)]">
              {hostname} · {item.sender.displayName} · {formatDate(item.createdAt)}
            </span>
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
