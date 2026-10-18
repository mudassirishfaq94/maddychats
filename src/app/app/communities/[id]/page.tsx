"use client";

import { useEffect, useState } from "react";
import { useRealtime } from "@/components/providers/realtime-provider";
import { useParams } from "next/navigation";
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
  myRole?: string | null;
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
  conversationId: string | null;
  createdAt: string;
}

export default function CommunityDetailPage() {
  const {subscribe}=useRealtime();
  const params = useParams();
  const communityId = params.id as string;

  const [community, setCommunity] = useState<CommunityDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [channelDescription,setChannelDescription]=useState("");
  const [channelType,setChannelType]=useState("text");
  const [editInfo,setEditInfo]=useState(false);
  const [description,setDescription]=useState("");
  const [busy,setBusy]=useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(()=>subscribe(event=>{if(event.type==="community:updated"&&event.communityId===communityId)setRetry(value=>value+1);}),[subscribe,communityId]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/communities/${communityId}`, { signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error(r.status === 404 ? "Community not found or access unavailable." : "Could not load this community. Please try again."); return r.json(); })
      .then((data) => {
        setCommunity(data.community);
        setMembers(data.members ?? []);
        setChannels(data.channels ?? []);
      })
      .catch((cause: Error) => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [communityId, retry]);

  async function handleCreateChannel() {
    if (!newChannelName.trim() || creating) return;
    setError(null);
    setCreating(true);
    try {
      const res = await fetch(`/api/communities/${communityId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_channel", name: newChannelName.trim(), description:channelDescription.trim(),type:channelType }),
      });
      if (!res.ok) { const data = await res.json().catch(() => null); throw new Error(data?.error ?? "Could not create the channel. Please try again."); }
      if (res.ok) {
        const data = await res.json();
        setChannels((prev) => [...prev, data.channel]);
        setShowCreateChannel(false);
        setNewChannelName("");setChannelDescription("");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Connection interrupted. Please try again."); }
    finally { setCreating(false); }
  }

  async function manage(patch:Record<string,unknown>){if(busy)return;setBusy(true);setError(null);try{const response=await fetch(`/api/communities/${communityId}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(patch)});if(!response.ok){const data=await response.json().catch(()=>null);throw new Error(data?.error??"Could not update community.");}setRetry(value=>value+1);setEditInfo(false);}catch(cause){setError(cause instanceof Error?cause.message:"Could not update community.");}finally{setBusy(false);}}
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
        <p role="alert" className="text-sm text-[var(--muted)]">{error ?? "Community not found."}</p>
        <button type="button" className="btn btn-secondary mt-3" onClick={() => { setLoading(true); setError(null); setRetry(value => value + 1); }}>Try again</button>
        <Link href="/app/communities" className="mt-3 text-sm font-medium text-[var(--accent)]">
          Back to communities
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-4 py-6 sm:px-6">
      {error && !showCreateChannel ? <p role="alert" className="mb-4 text-sm">{error}</p> : null}
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

      {community.myRole==="owner"||community.myRole==="admin"?<div className="mt-4"><button className="btn btn-secondary min-h-11" onClick={()=>{setDescription(community.description??"");setEditInfo(!editInfo);}}><Settings className="h-4 w-4"/>Community settings</button>{editInfo?<div className="mt-3 rounded-2xl border border-[var(--border)] p-4"><label className="block text-sm">Description and community rules<textarea className="field-input mt-2 min-h-24" maxLength={500} value={description} onChange={event=>setDescription(event.target.value)}/></label><label className="mt-3 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={community.isPublic} disabled={busy} onChange={event=>void manage({action:"edit",isPublic:event.target.checked})}/>Public community</label><button className="btn btn-primary mt-3 min-h-11" disabled={busy} onClick={()=>void manage({action:"edit",description})}>Save rules</button></div>:null}</div>:null}
      {community.myRole&&community.myRole!=="owner"?<button className="btn btn-secondary mt-3 min-h-11" disabled={busy} onClick={()=>void manage({action:"leave"})}>Leave community</button>:null}
      {/* Channels */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">Groups</h2>
          {community.myRole === "owner" || community.myRole === "admin" ? <button
            type="button"
            onClick={() => setShowCreateChannel(true)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--action)] text-[var(--action-fg)]"
            aria-label="Create group"
          >
            <Plus className="h-4 w-4" />
          </button> : null}
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
                href={channel.conversationId ? `/app/chats/${channel.conversationId}` : '#'}
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
            <div key={member.id} className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2">
              <Avatar user={member} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{member.displayName}</span>
                <span className="block text-[0.7rem] text-[var(--muted)]">
                  @{member.username} · {member.role}
                </span>
              </span>
              {community.myRole==="owner"&&member.role!=="owner"?<button type="button" className="min-h-11 rounded-lg px-2 text-xs text-[var(--accent)]" disabled={busy} onClick={()=>void manage({action:"role",userId:member.id,role:member.role==="admin"?"member":"admin"})}>{member.role==="admin"?"Remove admin":"Make admin"}</button>:null}
              {community.myRole==="owner"&&member.role!=="owner"?<button type="button" className="min-h-11 rounded-lg px-2 text-xs text-[var(--accent)]" disabled={busy} onClick={()=>{if(window.confirm(`Transfer community ownership to ${member.displayName}? You will become an admin.`))void manage({action:"transfer",userId:member.id});}}>Make owner</button>:null}
              {(community.myRole==="owner"&&member.role!=="owner")||(community.myRole==="admin"&&member.role==="member")?<button type="button" className="min-h-11 rounded-lg px-2 text-xs text-[var(--danger)]" disabled={busy} onClick={()=>void manage({action:"remove",userId:member.id})}>Remove</button>:null}
            </div>
          ))}
        </div>
      </div>

      {/* Create channel modal */}
      {showCreateChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card-glass w-full max-w-sm rounded-3xl p-6 animate-fade-up">
            <h3 className="text-base font-bold">Create group</h3>
            {error ? <p role="alert" className="mt-3 text-sm">{error}</p> : null}
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
            <label className="mt-3 block text-xs">Group type<select className="field-input mt-1" value={channelType} onChange={event=>setChannelType(event.target.value)}><option value="text">Group · everyone can send</option><option value="announcement">Announcements · admins send</option></select></label><label className="mt-3 block text-xs">Group description / rules<textarea className="field-input mt-1" maxLength={500} value={channelDescription} onChange={event=>setChannelDescription(event.target.value)}/></label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreateChannel(false)} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface-2)]">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateChannel}
                disabled={!newChannelName.trim() || creating}
                className="rounded-xl bg-[var(--action)] px-4 py-2 text-sm font-medium text-[var(--action-fg)] disabled:opacity-50"
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
