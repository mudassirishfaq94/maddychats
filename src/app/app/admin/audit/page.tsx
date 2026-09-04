"use client";

import { useEffect, useState } from "react";
import { ScrollText, Loader2 } from "lucide-react";

interface AuditEntry {
  id: string;
  action: string;
  details: Record<string, any> | null;
  createdAt: string;
  admin: { id: string; displayName: string; username: string };
}

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/audit-log")
      .then((r) => r.json())
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function formatAction(action: string) {
    return action
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Audit Log</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          History of all administrative actions.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--muted)]" />
        </div>
      ) : entries.length === 0 ? (
        <div className="card-flat rounded-2xl py-16 text-center">
          <ScrollText className="mx-auto h-8 w-8 text-[var(--muted)]" />
          <p className="mt-3 text-sm text-[var(--muted)]">No audit entries yet.</p>
        </div>
      ) : (
        <div className="card-flat overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                  <th className="px-4 py-3 font-semibold">Time</th>
                  <th className="px-4 py-3 font-semibold">Admin</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-[var(--surface-2)]">
                    <td className="whitespace-nowrap px-4 py-2.5 text-[var(--muted)]">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{entry.admin.displayName}</span>
                      <span className="ml-1 text-[var(--muted)]">@{entry.admin.username}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[0.65rem] font-medium">
                        {formatAction(entry.action)}
                      </span>
                    </td>
                    <td className="max-w-xs truncate px-4 py-2.5 text-[var(--muted)]">
                      {entry.details ? JSON.stringify(entry.details) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
