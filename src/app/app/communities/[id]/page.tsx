"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Hash,
  Users,
  Plus,
  Loader2,
  Settings,
  MessageSquare,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { cn } from "@/lib/utils";

interface CommunityDetail {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  createdBy: string;
  isPublic: boolean;
  memberCount: number;
  channelCount: number;
}

interface Member {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  joinedAt: string;
}

interface Channel {
  id: string;
  name: string;
  description: string | null;
  type: string;
  createdBy: string | null;
  createdAt: string;
}

export default function CommunityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const communityId = params.id as string;

  const [community, setCommunity] = useState<CommunityDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch(`/api/communities/${communityId}`)
      .then((r) => r.json())
      .then((data) => {
        setCommunity(data.community);
        setMembers(data.members ?? []);
        setChannels(data.channels ?? []);
      })
      .catch(() => router.push("/app/communities"))
      .finally(() => setLoading(false));
  }, [communityId, router]);

  async function handleCreateChannel() {
    if (!newChannelName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/communities/${communityId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_channel", name: newChannelName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setChannels((prev) => [...prev, data.channel]);
        setShowCreateChannel(false);
        setNewChannelName("");
      }
    } catch {}
    setCreating(false);
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--muted)]" />
      </div>
    );
  }

  if (!community) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <p className="text-sm text-[var(--muted)]">Community not found.</p>
        <Link href="/app/communities" className="mt-3 text-sm font-medium text-[var(--accent)]">
          Back to communities
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/app/communities"
          className="flex h-10 min-w-[44px] items-center justify-center rounded-full text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--muted)_12%,transparent)]"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-bold truncate">{community.name}</h1>
          <p className="text-xs text-[var(--muted)]">
            {community.memberCount} members · {channels.length} channels
          </p>
        </div>
      </div>

      {/* Description */}
      {community.description && (
        <p className="mt-3 text-sm text-[var(--muted)]">{community.description}</p>
      )}

      {/* Channels */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">Channels</h2>
          <button
            type="button"
            onClick={() => setShowCreateChannel(true)}
            className="flex h-8 min-w-[44px] items-center justify-center rounded-full bg-[var(--accent)] text-white"
            aria-label="Create channel"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {channels.length === 0 ? (
          <div className="py-8 text-center">
            <Hash className="mx-auto h-8 w-8 text-[var(--muted)] opacity-40" />
            <p className="mt-2 text-xs text-[var(--muted)]">No channels yet. Create one!</p>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {channels.map((channel) => (
              <Link
                key={channel.id}
                href={`/app/chats/${channel.id}`}
                className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
                  <Hash className="h-5 w-5 text-[var(--accent-fg)]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{channel.name}</span>
                  {channel.description && (
                    <span className="block text-[0.7rem] text-[var(--muted)] truncate">{channel.description}</span>
                  )}
                </span>
                <MessageSquare className="h-4 w-4 shrink-0 text-[var(--muted)]" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Members */}
      <div className="mt-8">
        <h2 className="text-sm font-bold">Members ({members.length})</h2>
        <div className="mt-3 space-y-1">
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-3 rounded-xl px-3 py-2">
              <Avatar user={member} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{member.displayName}</span>
                <span className="block text-[0.7rem] text-[var(--muted)]">
                  @{member.username} · {member.role}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Create channel modal */}
      {showCreateChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card-glass w-full max-w-sm rounded-3xl p-6 animate-fade-up">
            <h3 className="text-base font-bold">Create Channel</h3>
            <div className="mt-4">
              <input
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="channel-name"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreateChannel()}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreateChannel(false)} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface-2)]">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateChannel}
                disabled={!newChannelName.trim() || creating}
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
