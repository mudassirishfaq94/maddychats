"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Loader2,
  MessageCircle,
  Search,
  SquarePen,
  X,
} from "lucide-react";
import type { PublicUser } from "@/lib/types";
import type { ConversationDetail } from "@/lib/types";
import { Avatar } from "@/components/avatar";

/**
 * "New chat" button + modal: search the directory (debounced), pick a person,
 * and the API returns the existing dm or creates it — never duplicates.
 */
export function NewChatDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
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
          `/api/users/search?q=${encodeURIComponent(q)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (controller.signal.aborted) return;
        const data = (await res.json().catch(() => null)) as {
          users?: PublicUser[];
        } | null;
        setResults(data?.users ?? []);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 260);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  async function startWith(person: PublicUser) {
    setStarting(person.id);
    setError(null);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: person.id }),
      });
      const data = (await res.json().catch(() => null)) as {
        conversation?: ConversationDetail;
        error?: string;
      } | null;
      if (!res.ok || !data?.conversation) {
        setError(data?.error ?? "Could not start the conversation.");
        setStarting(null);
        return;
      }
      setOpen(false);
      setQuery("");
      setStarting(null);
      router.push(`/app/chats/${data.conversation.id}`);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setStarting(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Start a new chat"
        className="btn btn-primary h-9 w-9 rounded-xl! p-0!"
      >
        <SquarePen className="h-4 w-4" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Start a new chat"
          className="dialog-backdrop pt-[12vh] animate-fade-up"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="card-glass dialog-card max-w-md rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">New chat</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:text-[var(--text)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  const value = e.target.value;
                  setQuery(value);
                  if (value.trim().length < 2) {
                    setResults([]);
                    setLoading(false);
                  } else {
                    setLoading(true);
                  }
                }}
                placeholder="Search people…"
                aria-label="Search people"
                className="field-input field-input--icon"
              />
            </div>

            {error ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-[var(--danger)]">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </p>
            ) : null}

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <p className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching…
                </p>
              ) : results.length > 0 ? (
                <ul className="space-y-1">
                  {results.map((person) => (
                    <li key={person.id}>
                      <button
                        type="button"
                        onClick={() => void startWith(person)}
                        disabled={starting !== null}
                        className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--muted)_9%,transparent)] disabled:opacity-60"
                      >
                        <Avatar user={person} size={38} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {person.displayName}
                          </span>
                          <span className="block truncate text-xs text-[var(--muted)]">
                            @{person.username}
                          </span>
                        </span>
                        {starting === person.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
                        ) : (
                          <MessageCircle className="h-4 w-4 text-[var(--muted)]" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-8 text-center text-sm text-[var(--muted)]">
                  {query.trim().length >= 2
                    ? `No people match “${query.trim()}”.`
                    : "Type at least 2 characters to search."}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
