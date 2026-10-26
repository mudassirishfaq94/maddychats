"use client";

import { useAdminProof } from "@/components/admin-authentication";

import { useCallback, useEffect, useState } from "react";
import {
  Users,
  Shield,
  ShieldOff,
  Ban,
  CheckCircle,
  Search,
  Loader2,
  ChevronDown,
  Trash2,
} from "lucide-react";

interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: string;
  suspendedAt: string | null;
  suspendedUntil: string | null;
  suspensionReason: string | null;
  createdAt: string;
  lastSeenAt: string | null;
}

async function fetchAdminUsers(signal?: AbortSignal): Promise<AdminUser[]> {
  const response = await fetch("/api/admin/users", { cache: "no-store", signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error ?? "Could not refresh users.");
  return data.users ?? [];
}

export default function AdminUsersPage() {
  const { proof, clearProof, form } = useAdminProof();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      setUsers(await fetchAdminUsers());
    } catch (error) { setActionError(error instanceof Error ? error.message : "Could not refresh users."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchAdminUsers(controller.signal)
      .then((data) => { if (!controller.signal.aborted) setUsers(data); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setActionError(error instanceof Error ? error.message : "Could not refresh users.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const filtered = users.filter(
    (u) =>
      !query ||
      u.displayName.toLowerCase().includes(query.toLowerCase()) ||
      u.username.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase()),
  );

  async function mutateUser(userId: string, changes: Record<string, unknown>) {
    setBusyId(userId); setActionError(null);
    try {
      const response = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, ...changes, ...proof }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Administrative change failed.");
      await loadUsers();
    } catch (error) { setActionError(error instanceof Error ? error.message : "Administrative change failed."); }
    finally { clearProof(); setBusyId(null); }
  }
  async function changeRole(userId: string, newRole: string) { await mutateUser(userId, { action: "role", role: newRole }); }
  async function toggleSuspend(user: AdminUser) {
    if (user.suspendedAt) await mutateUser(user.id, { action: "unsuspend" });
    else {
      const reason = prompt("Suspension reason:");
      if (reason) await mutateUser(user.id, { action: "suspend", reason, days: 7 });
    }
  }

  async function deleteUser(user: AdminUser) {
    if (!confirm(`Permanently delete ${user.displayName}? This cannot be undone.`)) return;
    setBusyId(user.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(proof) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not delete this user.");
      // Refetch after the destructive action so the view always reflects the
      // database, including cascaded membership/message cleanup.
      await loadUsers();
    } catch (error) { setActionError(error instanceof Error ? error.message : "Could not delete this user.");
    } finally { clearProof(); setBusyId(null); }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--muted)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Manage users</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Change user access, pause accounts, or remove accounts.
        </p>
      </div>

      {form}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search users by name, username, or email..."
          className="field-input field-input--icon w-full"
        />
      </div>
      {actionError ? <p role="alert" className="text-sm text-[var(--danger)]">{actionError}</p> : null}

      <div className="card-flat rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[0.7rem] uppercase tracking-wider text-[var(--muted)]">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3">
                    <div>
                      <span className="font-medium">{user.displayName}</span>
                      <span className="ml-2 text-xs text-[var(--muted)]">@{user.username}</span>
                    </div>
                    <div className="text-[0.65rem] text-[var(--muted)]">{user.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      onChange={(e) => void changeRole(user.id, e.target.value)}
                      disabled={busyId === user.id}
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs font-medium"
                    >
                      <option value="user">User</option>
                      <option value="moderator">Moderator</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {user.suspendedAt ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-2 py-0.5 text-[0.65rem] font-semibold text-[var(--danger)]">
                        <Ban className="h-3 w-3" />
                        Suspended
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--success)_12%,transparent)] px-2 py-0.5 text-[0.65rem] font-semibold text-[var(--success)]">
                        <CheckCircle className="h-3 w-3" />
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)]">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void toggleSuspend(user)}
                      disabled={busyId === user.id || user.role === "admin"}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                        user.suspendedAt
                          ? "text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)]"
                          : "text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
                      } disabled:opacity-50`}
                    >
                      {user.suspendedAt ? "Unsuspend" : "Suspend"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteUser(user)}
                      disabled={busyId === user.id || user.role === "admin"}
                      className="ml-2 rounded-lg p-1.5 text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] disabled:opacity-50"
                      aria-label={`Delete ${user.displayName}`}
                      title="Permanently delete user"
                    ><Trash2 className="mr-1 inline h-3.5 w-3.5" />Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
