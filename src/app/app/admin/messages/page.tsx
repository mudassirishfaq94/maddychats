"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Trash2,
  X,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { cn, timeAgo } from "@/lib/utils";

interface AdminMessage {
  id: string;
  text: string;
  createdAt: string;
  senderId: string;
  senderName: string;
  senderUsername: string;
  conversationId: string;
  conversationName: string;
}

export default function AdminMessagesPage() {
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchMessages = useCallback(async (page = 1, q = search) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "30" });
      if (q) params.set("q", q);
      const res = await fetch(`/api/admin/messages?${params}`);
      const data = await res.json();
      setMessages(data.messages ?? []);
      setPagination(data.pagination);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchMessages(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch() {
    setSearch(searchInput);
    fetchMessages(1, searchInput);
  }

  async function deleteMessage(id: string) {
    if (!confirm("Delete this message?")) return;
    setBusy(true);
    await fetch(`/api/admin/messages/${id}`, { method: "DELETE" });
    fetchMessages(pagination.page);
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Messages</h1>
        <p className="mt-0.5 text-sm text-[var(--muted)]">
          Browse and manage all messages across conversations.
        </p>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search message content…"
            className="field-input field-input--icon w-full py-2! text-sm!"
          />
        </div>
        <button type="button" onClick={handleSearch} className="btn btn-primary px-4 py-2 text-sm">
          Search
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--muted)]" />
        </div>
      ) : messages.length === 0 ? (
        <div className="py-12 text-center text-sm text-[var(--muted)]">No messages found.</div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg) => (
            <div key={msg.id} className="card-flat flex items-start gap-3 rounded-xl p-3">
              <Avatar user={{ displayName: msg.senderName, username: msg.senderUsername, avatarUrl: null } as never} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">{msg.senderName}</span>
                  <span className="text-[0.65rem] text-[var(--muted)]">@{msg.senderUsername}</span>
                  <span className="text-[0.6rem] text-[var(--muted)]">in {msg.conversationName}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-sm">{msg.text || "Attachment"}</p>
                <p className="mt-1 text-[0.6rem] text-[var(--muted)]">{timeAgo(msg.createdAt)}</p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => deleteMessage(msg.id)}
                className="shrink-0 rounded-lg p-1.5 text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] hover:text-[var(--danger)]"
                title="Delete message"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={pagination.page <= 1}
            onClick={() => fetchMessages(pagination.page - 1)}
            className="btn btn-ghost px-3 py-1.5 text-sm disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-[var(--muted)]">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button
            type="button"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => fetchMessages(pagination.page + 1)}
            className="btn btn-ghost px-3 py-1.5 text-sm disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
