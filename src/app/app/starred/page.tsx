"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Star, Loader2, MessageSquare } from "lucide-react";
import { Avatar } from "@/components/avatar";
import type { StarredMessageDTO } from "@/server/chat";
import { formatDate } from "@/lib/utils";

export default function StarredPage() {
  const [starred, setStarred] = useState<StarredMessageDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/users/me/starred-messages")
      .then((r) => r.json())
      .then((data: { starred?: StarredMessageDTO[] }) => {
        setStarred(data.starred ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Star className="h-5 w-5 text-[var(--accent-fg)]" />
        <h1 className="font-display text-xl font-bold">Starred Messages</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--muted)]" />
        </div>
      ) : starred.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Star className="h-10 w-10 text-[var(--muted)] opacity-40" />
          <p className="mt-4 text-sm font-semibold">No starred messages</p>
          <p className="mt-1.5 max-w-[18rem] text-xs leading-relaxed text-[var(--muted)]">
            Star messages to find them easily later.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {starred.map((item) => (
            <li key={item.id}>
              <Link
                href={`/app/chats/${item.conversation.id}?message=${item.messageId}`}
                className="block rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]"
              >
                <div className="flex items-start gap-3">
                  <Avatar user={item.sender} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold">
                        {item.sender.displayName}
                      </span>
                      <span className="text-[0.66rem] text-[var(--muted)]">
                        in {item.conversation.name ?? item.sender.displayName}
                      </span>
                    </div>
                    {item.deletedAt ? (
                      <p className="mt-1 text-sm italic text-[var(--muted)]">
                        Message deleted
                      </p>
                    ) : (
                      <p className="mt-1 line-clamp-2 text-sm text-[var(--text)]">
                        {item.text || "Attachment"}
                      </p>
                    )}
                    {item.attachments.length > 0 && !item.deletedAt ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {item.attachments.map((a) => (
                          <span
                            key={a.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-[var(--surface-2)] px-2 py-0.5 text-[0.66rem] text-[var(--muted)]"
                          >
                            <MessageSquare className="h-3 w-3" />
                            {a.originalName}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <span className="mt-2 block text-[0.66rem] text-[var(--muted)]">
                      {formatDate(item.starredAt)}
                    </span>
                  </div>
                  <Star className="h-4 w-4 shrink-0 text-[var(--accent-fg)]" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
