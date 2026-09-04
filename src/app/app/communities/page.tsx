"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Plus,
  Hash,
  Globe,
  Lock,
  Loader2,
  ArrowLeft,
  Search,
  X,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { cn } from "@/lib/utils";

interface Community {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  createdBy: string;
  isPublic: boolean;
  createdAt: string;
  memberCount?: number;
  channelCount?: number;
  myRole?: string;
}

export default function CommunitiesPage() {
  const [myCommunities, setMyCommunities] = useState<Community[]>([]);
  const [publicCommunities, setPublicCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<"my" | "browse">("my");

  useEffect(() => {
    fetch("/api/communities")
      .then((r) => r.json())
      .then((data) => {
        setMyCommunities(data.myCommunities ?? []);
        setPublicCommunities(data.publicCommunities ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setMyCommunities((prev) => [{ ...data.community, memberCount: 1, channelCount: 0, myRole: "owner" }, ...prev]);
        setShowCreate(false);
        setNewName("");
        setNewDesc("");
      }
    } catch {}
    setCreating(false);
  }

  async function handleJoin(communityId: string) {
    const res = await fetch(`/api/communities/${communityId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join" }),
    });
    if (res.ok) {
      const community = publicCommunities.find((c) => c.id === communityId);
      if (community) {
        setMyCommunities((prev) => [{ ...community, myRole: "member", memberCount: (community.memberCount ?? 0) + 1 }, ...prev]);
        setPublicCommunities((prev) => prev.filter((c) => c.id !== communityId));
      }
    }
  }

  const communities = tab === "my" ? myCommunities : publicCommunities;

  return (
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/app"
            className="flex h-10 min-w-[44px] items-center justify-center rounded-full text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--muted)_12%,transparent)]"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="font-display text-xl font-bold">Communities</h1>
            <p className="text-xs text-[var(--muted)]">
              {myCommunities.length} joined · {publicCommunities.length} available
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex h-10 min-w-[44px] items-center justify-center rounded-full bg-[var(--accent)] text-white"
          aria-label="Create community"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="mt-4 flex gap-2">
        {(["my", "browse"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
              tab === t ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-2)] text-[var(--muted)]"
            }`}
          >
            {t === "my" ? `My Communities (${myCommunities.length})` : `Browse (${publicCommunities.length})`}
          </button>
        ))}
      </div>

      {/* Community list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--muted)]" />
        </div>
      ) : communities.length === 0 ? (
        <div className="py-16 text-center">
          <Users className="mx-auto h-10 w-10 text-[var(--muted)] opacity-40" />
          <p className="mt-3 text-sm text-[var(--muted)]">
            {tab === "my" ? "You haven't joined any communities yet." : "No public communities found."}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {communities.map((community) => (
            <div
              key={community.id}
              className="card-flat rounded-2xl p-4 transition-colors hover:border-[var(--border-strong)]"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-lg font-bold text-[var(--accent-fg)]">
                  {community.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/app/communities/${community.id}`} className="text-sm font-semibold hover:underline">
                    {community.name}
                  </Link>
                  {community.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-[var(--muted)]">{community.description}</p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-[0.65rem] text-[var(--muted)]">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {community.memberCount ?? 0} members
                    </span>
                    <span className="flex items-center gap-1">
                      <Hash className="h-3 w-3" />
                      {community.channelCount ?? 0} channels
                    </span>
                    {community.isPublic ? (
                      <span className="flex items-center gap-1 text-[var(--success)]">
                        <Globe className="h-3 w-3" /> Public
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[var(--muted)]">
                        <Lock className="h-3 w-3" /> Private
                      </span>
                    )}
                  </div>
                </div>
                {tab === "browse" && !community.myRole && (
                  <button
                    type="button"
                    onClick={() => void handleJoin(community.id)}
                    className="shrink-0 rounded-xl bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Join
                  </button>
                )}
                {community.myRole && (
                  <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[0.6rem] font-semibold text-[var(--accent-fg)]">
                    {community.myRole}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create community modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card-glass w-full max-w-md rounded-3xl p-6 animate-fade-up">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">Create Community</h3>
              <button type="button" onClick={() => setShowCreate(false)} className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Community name"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none"
                autoFocus
              />
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Description (optional)"
                rows={3}
                className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface-2)]">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
