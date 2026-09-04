"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Compass,
  RefreshCw,
  Search,
  SearchX,
} from "lucide-react";
import type { PublicUser } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { StartConversationButton } from "@/components/chats/start-conversation-button";
import { useRealtime } from "@/components/providers/realtime-provider";
import { timeAgo } from "@/lib/utils";

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "done"; users: PublicUser[] };

/**
 * Debounced people search with idle / loading / empty / error states.
 * Results exclude the viewer (enforced server-side), link to public profiles,
 * and can start direct conversations.
 */
export function PeopleSearch() {
  const { presence } = useRealtime();
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      abortRef.current?.abort();
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(q)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (controller.signal.aborted) return;
        const data = (await res.json().catch(() => null)) as {
          users?: PublicUser[];
          error?: string;
        } | null;
        if (!res.ok) {
          setPhase({
            kind: "error",
            message: data?.error ?? "Search failed. Please try again.",
          });
          return;
        }
        setPhase({ kind: "done", users: data?.users ?? [] });
      } catch {
        if (!controller.signal.aborted) {
          setPhase({ kind: "error", message: "Network error. Please try again." });
        }
      }
    }, 280);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const q = query.trim();

  return (
    <div>
      {/* ---------- search input ---------- */}
      <div className="relative animate-fade-up" style={{ "--d": "80ms" } as React.CSSProperties}>
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]">
          <Search className="h-4.5 w-4.5" />
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            const value = e.target.value;
            setQuery(value);
            setPhase(
              value.trim().length < 2 ? { kind: "idle" } : { kind: "loading" },
            );
          }}
          placeholder="Search by username or display name…"
          aria-label="Search people"
          className="field-input rounded-2xl! py-3.5! pl-12! text-base!"
        />
      </div>

      {/* ---------- states ---------- */}
      <div className="mt-5">
        {phase.kind === "idle" ? (
          <div className="card-flat rounded-3xl px-8 py-14 text-center animate-fade-up">
            <Compass className="mx-auto h-8 w-8 text-[var(--accent)]" />
            <p className="mt-4 font-semibold">Find your people</p>
            <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-[var(--muted)]">
              Type at least 2 characters to search everyone on ZipTalk by
              username or display name.
            </p>
          </div>
        ) : null}

        {phase.kind === "loading" ? (
          <div className="space-y-3" aria-label="Loading results">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="card-flat flex items-center gap-4 rounded-2xl p-4">
                <span className="h-11 w-11 animate-pulse rounded-full bg-[var(--border)]" />
                <div className="flex-1 space-y-2">
                  <span className="block h-3 w-32 animate-pulse rounded-full bg-[var(--border)]" />
                  <span className="block h-2.5 w-48 animate-pulse rounded-full bg-[var(--border)] opacity-70" />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {phase.kind === "error" ? (
          <div className="card-flat rounded-3xl px-8 py-14 text-center animate-fade-up">
            <AlertTriangle className="mx-auto h-8 w-8 text-[var(--danger)]" />
            <p className="mt-4 font-semibold">Search hit a snag</p>
            <p className="mx-auto mt-1.5 max-w-xs text-sm text-[var(--muted)]">
              {phase.message}
            </p>
            <button
              type="button"
              onClick={() => setQuery((v) => v.slice())}
              className="btn btn-secondary mx-auto mt-6"
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </button>
          </div>
        ) : null}

        {phase.kind === "done" && phase.users.length === 0 ? (
          <div className="card-flat rounded-3xl px-8 py-14 text-center animate-fade-up">
            <SearchX className="mx-auto h-8 w-8 text-[var(--muted)]" />
            <p className="mt-4 font-semibold">
              No people match &ldquo;{q}&rdquo;
            </p>
            <p className="mx-auto mt-1.5 max-w-xs text-sm text-[var(--muted)]">
              Check the spelling, or try a different name or username.
            </p>
          </div>
        ) : null}

        {phase.kind === "done" && phase.users.length > 0 ? (
          <ul className="space-y-3">
            {phase.users.map((person, i) => (
              <li
                key={person.id}
                className="animate-fade-up"
                style={{ "--d": `${i * 50}ms` } as React.CSSProperties}
              >
                <div className="card-glass group flex items-center gap-4 rounded-2xl p-4 transition-transform duration-200 hover:-translate-y-0.5">
                  <Link
                    href={`/app/users/${person.id}`}
                    className="flex min-w-0 flex-1 items-center gap-4"
                  >
                    <Avatar user={person} size={46} />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {person.displayName}
                      </span>
                      <span className="block truncate text-sm text-[var(--muted)]">
                        @{person.username}
                        {person.bio ? (
                          <span className="hidden sm:inline">
                            {" "}
                            · {person.bio}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </Link>
                  <span className="hidden shrink-0 text-xs md:block">
                    {presence[person.id]?.online ? (
                      <span className="flex items-center gap-1.5 text-[var(--success)]">
                        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
                        Online
                      </span>
                    ) : (
                      <span className="text-[var(--muted)]">
                        {person.lastSeenAt
                          ? `Active ${timeAgo(person.lastSeenAt)}`
                          : "New here"}
                      </span>
                    )}
                  </span>
                  <StartConversationButton
                    userId={person.id}
                    className="btn-secondary shrink-0 px-3.5! py-2! text-xs!"
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
