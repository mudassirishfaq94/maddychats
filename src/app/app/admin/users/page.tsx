"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Ban,
  Trash2,
  Edit,
  Eye,
  UserPlus,
  X,
  ShieldCheck,
  ShieldOff,
  Mail,
  AtSign,
  Clock,
  MessageSquare,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { cn, timeAgo } from "@/lib/utils";

interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  isBanned: boolean;
  messageCount: number;
  conversationCount: number;
}

interface UserDetail {
  user: AdminUser;
  stats: { messageCount: number; conversationCount: number };
  recentMessages: Array<{
    id: string;
    text: string;
    createdAt: string;
    conversationId: string;
  }>;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [editModal, setEditModal] = useState<AdminUser | null>(null);
  const [createModal, setCreateModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async (page = 1, q = search) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (q) params.set("q", q);
      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();
      setUsers(data.users ?? []);
      setPagination(data.pagination);
    } catch {
      setError("Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchUsers(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch() {
    setSearch(searchInput);
    fetchUsers(1, searchInput);
  }

  async function handleAction(action: string, user: AdminUser) {
    setActionMenu(null);

    if (action === "view") {
      const res = await fetch(`/api/admin/users/${user.id}`);
      const data = await res.json();
      setSelectedUser(data);
    } else if (action === "edit") {
      setEditModal(user);
    } else if (action === "ban") {
      if (!confirm(`Ban ${user.displayName}? They won't be able to log in.`)) return;
      setBusy(true);
      await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ban: !user.isBanned }),
      });
      fetchUsers(pagination.page);
      setBusy(false);
    } else if (action === "delete") {
      if (!confirm(`Permanently delete ${user.displayName}? This cannot be undone.`)) return;
      setBusy(true);
      await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      fetchUsers(pagination.page);
      setBusy(false);
    }
  }

  async function handleSaveEdit(formData: {
    displayName: string;
    username: string;
    email: string;
    bio: string;
    password: string;
  }) {
    if (!editModal) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { ...formData };
      if (!body.password) delete body.password;
      const res = await fetch(`/api/admin/users/${editModal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Update failed.");
        return;
      }
      setEditModal(null);
      fetchUsers(pagination.page);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Users</h1>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            {pagination.total} user{pagination.total !== 1 ? "s" : ""} total
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateModal(true)}
          className="btn btn-primary flex items-center gap-2 px-3 py-2 text-sm"
        >
          <UserPlus className="h-4 w-4" />
          Add User
        </button>
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
            placeholder="Search by name, username, or email…"
            className="field-input field-input--icon w-full py-2! text-sm!"
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          className="btn btn-primary px-4 py-2 text-sm"
        >
          Search
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-4 py-2.5 text-sm text-[var(--danger)]">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* User Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--muted)]" />
        </div>
      ) : users.length === 0 ? (
        <div className="py-12 text-center text-sm text-[var(--muted)]">
          No users found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--surface-2)]">
              <tr>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">User</th>
                <th className="hidden px-4 py-3 font-medium text-[var(--muted)] sm:table-cell">Email</th>
                <th className="hidden px-4 py-3 font-medium text-[var(--muted)] md:table-cell">Messages</th>
                <th className="hidden px-4 py-3 font-medium text-[var(--muted)] md:table-cell">Chats</th>
                <th className="hidden px-4 py-3 font-medium text-[var(--muted)] lg:table-cell">Last Seen</th>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">Status</th>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-[var(--surface-2)]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar user={user as never} size={32} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{user.displayName}</p>
                        <p className="truncate text-xs text-[var(--muted)]">@{user.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-[var(--muted)] sm:table-cell">{user.email}</td>
                  <td className="hidden px-4 py-3 tabular-nums md:table-cell">{user.messageCount}</td>
                  <td className="hidden px-4 py-3 tabular-nums md:table-cell">{user.conversationCount}</td>
                  <td className="hidden px-4 py-3 text-xs text-[var(--muted)] lg:table-cell">
                    {user.lastSeenAt ? timeAgo(user.lastSeenAt) : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    {user.isBanned ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-2 py-0.5 text-[0.65rem] font-semibold text-[var(--danger)]">
                        <Ban className="h-3 w-3" /> Banned
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--success)_12%,transparent)] px-2 py-0.5 text-[0.65rem] font-semibold text-[var(--success)]">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setActionMenu(actionMenu === user.id ? null : user.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface)]"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                      {actionMenu === user.id && (
                        <div className="card-glass absolute right-0 top-full z-50 mt-1 w-44 rounded-xl p-1.5 shadow-lg">
                          <button type="button" onClick={() => handleAction("view", user)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-[var(--surface-2)]">
                            <Eye className="h-3.5 w-3.5" /> View Details
                          </button>
                          <button type="button" onClick={() => handleAction("edit", user)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-[var(--surface-2)]">
                            <Edit className="h-3.5 w-3.5" /> Edit User
                          </button>
                          <button type="button" onClick={() => handleAction("ban", user)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-[var(--surface-2)]">
                            {user.isBanned ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}
                            {user.isBanned ? "Unban" : "Ban"} User
                          </button>
                          <div className="my-1 border-t border-[var(--border)]" />
                          <button type="button" onClick={() => handleAction("delete", user)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_8%,transparent)]">
                            <Trash2 className="h-3.5 w-3.5" /> Delete User
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={pagination.page <= 1}
            onClick={() => fetchUsers(pagination.page - 1)}
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
            onClick={() => fetchUsers(pagination.page + 1)}
            className="btn btn-ghost px-3 py-1.5 text-sm disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* User Detail Modal */}
      {selectedUser && (
        <UserDetailModal user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}

      {/* Edit User Modal */}
      {editModal && (
        <EditUserModal
          user={editModal}
          busy={busy}
          onSave={handleSaveEdit}
          onClose={() => setEditModal(null)}
        />
      )}

      {/* Create User Modal */}
      {createModal && (
        <CreateUserModal
          busy={busy}
          onCreated={() => { setCreateModal(false); fetchUsers(1); }}
          onClose={() => setCreateModal(false)}
        />
      )}
    </div>
  );
}

/* =================== User Detail Modal =================== */

function UserDetailModal({ user, onClose }: { user: UserDetail; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-4 right-0 z-[90] w-full max-w-md overflow-y-auto rounded-l-2xl bg-[var(--surface)] shadow-xl sm:inset-y-8 sm:right-8 sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-5 py-4">
          <h2 className="text-base font-bold">User Details</h2>
          <button type="button" onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">
          <div className="flex flex-col items-center gap-3 pb-5 border-b border-[var(--border)]">
            <Avatar user={user.user as never} size={72} />
            <div className="text-center">
              <h3 className="text-lg font-bold">{user.user.displayName}</h3>
              <p className="text-sm text-[var(--muted)]">@{user.user.username}</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <InfoRow icon={Mail} label="Email" value={user.user.email} />
            <InfoRow icon={AtSign} label="Username" value={user.user.username} />
            <InfoRow icon={Clock} label="Joined" value={new Date(user.user.createdAt).toLocaleDateString()} />
            <InfoRow icon={Clock} label="Last Seen" value={user.user.lastSeenAt ? timeAgo(user.user.lastSeenAt) : "Never"} />
            <InfoRow icon={MessageSquare} label="Messages" value={String(user.stats.messageCount)} />
            <InfoRow icon={MessageSquare} label="Conversations" value={String(user.stats.conversationCount)} />
          </div>

          {user.user.bio && (
            <div className="mt-5 rounded-xl bg-[var(--surface-2)] p-3">
              <p className="text-xs text-[var(--muted)]">Bio</p>
              <p className="mt-1 text-sm">{user.user.bio}</p>
            </div>
          )}

          {user.recentMessages.length > 0 && (
            <div className="mt-5">
              <h4 className="mb-2 text-xs font-semibold text-[var(--muted)]">Recent Messages</h4>
              <div className="space-y-2">
                {user.recentMessages.map((msg) => (
                  <div key={msg.id} className="rounded-xl bg-[var(--surface-2)] p-2.5">
                    <p className="line-clamp-2 text-xs">{msg.text || "Attachment"}</p>
                    <p className="mt-1 text-[0.6rem] text-[var(--muted)]">
                      {timeAgo(msg.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-[var(--muted)]" />
      <div className="min-w-0 flex-1">
        <p className="text-[0.65rem] text-[var(--muted)]">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

/* =================== Edit User Modal =================== */

function EditUserModal({
  user,
  busy,
  onSave,
  onClose,
}: {
  user: AdminUser;
  busy: boolean;
  onSave: (data: { displayName: string; username: string; email: string; bio: string; password: string }) => void;
  onClose: () => void;
}) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [bio, setBio] = useState(user.bio ?? "");
  const [password, setPassword] = useState("");

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-4 right-0 z-[90] w-full max-w-md overflow-y-auto rounded-l-2xl bg-[var(--surface)] shadow-xl sm:inset-y-8 sm:right-8 sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-5 py-4">
          <h2 className="text-base font-bold">Edit User</h2>
          <button type="button" onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <Field label="Display Name" value={displayName} onChange={setDisplayName} />
          <Field label="Username" value={username} onChange={setUsername} prefix="@" />
          <Field label="Email" value={email} onChange={setEmail} type="email" />
          <Field label="Bio" value={bio} onChange={setBio} textarea />
          <Field label="New Password" value={password} onChange={setPassword} type="password" placeholder="Leave blank to keep current" />

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost flex-1 py-2.5 text-sm">
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onSave({ displayName, username, email, bio, password })}
              className="btn btn-primary flex-1 py-2.5 text-sm"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* =================== Create User Modal =================== */

function CreateUserModal({
  busy,
  onCreated,
  onClose,
}: {
  busy: boolean;
  onCreated: () => void;
  onClose: () => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!displayName || !username || !email || !password) {
      setError("All fields are required.");
      return;
    }
    setError(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, username, email, password }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to create user.");
      return;
    }
    onCreated();
  }

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-4 right-0 z-[90] w-full max-w-md overflow-y-auto rounded-l-2xl bg-[var(--surface)] shadow-xl sm:inset-y-8 sm:right-8 sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-5 py-4">
          <h2 className="text-base font-bold">Create User</h2>
          <button type="button" onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          {error && (
            <div className="rounded-xl bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-xs text-[var(--danger)]">
              {error}
            </div>
          )}
          <Field label="Display Name" value={displayName} onChange={setDisplayName} />
          <Field label="Username" value={username} onChange={setUsername} prefix="@" />
          <Field label="Email" value={email} onChange={setEmail} type="email" />
          <Field label="Password" value={password} onChange={setPassword} type="password" />

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost flex-1 py-2.5 text-sm">
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleCreate}
              className="btn btn-primary flex-1 py-2.5 text-sm"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create User"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* =================== Shared Field Component =================== */

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  prefix,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  prefix?: string;
  textarea?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--muted)]">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">
            {prefix}
          </span>
        )}
        {textarea ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            className={cn("field-input w-full py-2! text-sm!", prefix && "pl-7!")}
          />
        ) : (
          <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={cn("field-input w-full py-2! text-sm!", prefix && "pl-7!")}
          />
        )}
      </div>
    </div>
  );
}
