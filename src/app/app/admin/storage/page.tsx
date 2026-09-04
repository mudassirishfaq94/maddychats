"use client";

import { useEffect, useState } from "react";
import { HardDrive, Image, FileText, Mic, Loader2 } from "lucide-react";

interface StorageStats {
  totalAttachments: number;
  totalSize: number;
  byType: Array<{ kind: string; count: number; totalSize: number }>;
  topUploaders: Array<{ userId: string; displayName: string; count: number; totalSize: number }>;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function AdminStoragePage() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/storage")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[var(--muted)]" /></div>;
  }

  if (!stats) {
    return <div className="py-20 text-center text-sm text-[var(--muted)]">Failed to load storage stats.</div>;
  }

  const kindIcons: Record<string, typeof Image> = { image: Image, file: FileText, audio: Mic };
  const maxTypeSize = Math.max(...stats.byType.map((t) => t.totalSize), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Storage Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Monitor file storage usage and top uploaders.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card-flat rounded-2xl p-4">
          <HardDrive className="h-5 w-5 text-[var(--accent)]" />
          <p className="mt-2 text-2xl font-bold">{formatBytes(stats.totalSize)}</p>
          <p className="text-[0.7rem] text-[var(--muted)]">Total Storage</p>
        </div>
        <div className="card-flat rounded-2xl p-4">
          <FileText className="h-5 w-5 text-blue-500" />
          <p className="mt-2 text-2xl font-bold">{stats.totalAttachments.toLocaleString()}</p>
          <p className="text-[0.7rem] text-[var(--muted)]">Total Files</p>
        </div>
      </div>

      <div className="card-flat rounded-2xl p-5">
        <h3 className="mb-3 text-sm font-semibold">Storage by Type</h3>
        <div className="space-y-3">
          {stats.byType.map((type) => {
            const Icon = kindIcons[type.kind] ?? FileText;
            return (
              <div key={type.kind}>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium capitalize">
                    <Icon className="h-3.5 w-3.5" /> {type.kind}
                  </span>
                  <span className="text-[var(--muted)]">{type.count} files · {formatBytes(type.totalSize)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(type.totalSize / maxTypeSize) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card-flat rounded-2xl p-5">
        <h3 className="mb-3 text-sm font-semibold">Top Uploaders</h3>
        {stats.topUploaders.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">No uploads yet.</p>
        ) : (
          <div className="space-y-2">
            {stats.topUploaders.map((user, i) => (
              <div key={user.userId} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[0.65rem] font-bold text-[var(--muted)]">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{user.displayName}</span>
                <span className="text-xs text-[var(--muted)]">{user.count} files · {formatBytes(user.totalSize)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
