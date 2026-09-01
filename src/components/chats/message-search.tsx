"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, SearchX, X } from "lucide-react";
import type { SearchHit } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { formatDate } from "@/lib/utils";

/**
 * Message search across every conversation the user belongs to.
 * Selecting a hit opens that conversation and locates the message.
 */
export function MessageSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search/messages?q=${encodeURIComponent(q)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (controller.signal.aborted) return;
        const data = (await res.json().catch(() => null)) as {
          results?: SearchHit[];
        } | null;
        setResults(data?.results ?? []);
        setSearched(true);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 280);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  function openHit(hit: SearchHit) {
    setOpen(false);
    setQuery("");
    router.push(
      `/app/chats/${hit.conversation.id}?message=${hit.message.id}`,
    );
  }

  function highlight(text: string) {
    const q = query.trim();
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0 || !q) return text.slice(0, 140);
    const start = Math.max(0, idx - 40);
    return (
      <>
        {start > 0 ? "…" : ""}
        {text.slice(start, idx)}
        <mark className="rounded bg-[color-mix(in_srgb,var(--accent)_35%,transparent)] px-0.5 text-[var(--text)]">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length, idx + q.length + 60)}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search messages"
        title="Search messages"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition-all hover:border-[var(--border-strong)] hover:text-[var(--text)]"
      >
        <Search className="h-4 w-4" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search messages"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          className="dialog-backdrop z-[90] pt-[10vh] animate-fade-up"
        >
          <div className="card-glass dialog-card max-w-xl overflow-hidden rounded-3xl">
            <div className="relative border-b border-[var(--border)]">
              <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  const value = e.target.value;
                  setQuery(value);
                  if (value.trim().length < 2) {
                    setResults([]);
                    setSearched(false);
                    setLoading(false);
                  } else {
                    setLoading(true);
                  }
                }}
                placeholder="Search your messages…"
                aria-label="Search messages"
                className="w-full bg-transparent py-4 pl-12 pr-12 text-[0.95rem] outline-none placeholder:text-[color-mix(in_srgb,var(--muted)_60%,transparent)]"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close search"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {loading ? (
                <p className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching…
                </p>
              ) : results.length > 0 ? (
                <ul className="space-y-1">
                  {results.map((hit) => (
                    <li key={hit.message.id}>
                      <button
                        type="button"
                        onClick={() => openHit(hit)}
                        className="flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--muted)_9%,transparent)]"
                      >
                        <Avatar user={hit.sender} size={34} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="truncate text-sm font-semibold">
                              {hit.sender.displayName}
                            </span>
                            <span className="shrink-0 text-[0.65rem] text-[var(--muted)]">
                              {formatDate(hit.message.createdAt)}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
                            {highlight(hit.message.text)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : searched ? (
                <div className="py-12 text-center">
                  <SearchX className="mx-auto h-7 w-7 text-[var(--muted)]" />
                  <p className="mt-3 text-sm font-semibold">No messages found</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Try a different word or phrase.
                  </p>
                </div>
              ) : (
                <p className="py-12 text-center text-sm text-[var(--muted)]">
                  Type at least 2 characters to search your conversations.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
