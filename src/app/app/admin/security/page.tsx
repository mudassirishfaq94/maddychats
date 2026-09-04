"use client";

import { useEffect, useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Loader2,
  Globe,
  Monitor,
  Clock,
  Trash2,
  AlertTriangle,
} from "lucide-react";

interface LoginEntry {
  id: string;
  identifier: string;
  success: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface RetentionStats {
  totalMessages: number;
  messagesOlderThan90d: number;
  messagesOlderThan180d: number;
  totalAttachments: number;
  attachmentsOlderThan90d: number;
  scheduledMessages: number;
  oldAuditLogs: number;
}

function formatUserAgent(ua: string | null): string {
  if (!ua) return "Unknown";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari")) return "Safari";
  if (ua.includes("Edge")) return "Edge";
  return "Other";
}

export default function AdminSecurityPage() {
  const [logins, setLogins] = useState<LoginEntry[]>([]);
  const [retention, setRetention] = useState<RetentionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"logins" | "retention">("logins");

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/security/login-history").then((r) => r.json()),
      fetch("/api/admin/security/retention").then((r) => r.json()),
    ])
      .then(([loginsData, retentionData]) => {
        setLogins(loginsData.logins ?? []);
        setRetention(retentionData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const failedLogins = logins.filter((l) => !l.success);
  const successLogins = logins.filter((l) => l.success);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[var(--muted)]" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Security & Retention</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Failed login monitoring and data retention controls.</p>
      </div>

      <div className="flex gap-2">
        {(["logins", "retention"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === t ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-2)] text-[var(--muted)]"
            }`}
          >
            {t === "logins" ? "Login History" : "Retention Controls"}
          </button>
        ))}
      </div>

      {tab === "logins" ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="card-flat rounded-2xl p-4">
              <ShieldAlert className="h-5 w-5 text-[var(--danger)]" />
              <p className="mt-2 text-2xl font-bold">{failedLogins.length}</p>
              <p className="text-[0.7rem] text-[var(--muted)]">Failed Logins (24h)</p>
            </div>
            <div className="card-flat rounded-2xl p-4">
              <ShieldCheck className="h-5 w-5 text-[var(--success)]" />
              <p className="mt-2 text-2xl font-bold">{successLogins.length}</p>
              <p className="text-[0.7rem] text-[var(--muted)]">Successful Logins (24h)</p>
            </div>
          </div>

          {failedLogins.length > 0 && (
            <div className="card-flat rounded-2xl p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--danger)]">
                <AlertTriangle className="h-4 w-4" />
                Failed Login Attempts
              </h3>
              <div className="space-y-2">
                {failedLogins.slice(0, 20).map((entry) => (
                  <div key={entry.id} className="flex items-center gap-3 rounded-xl bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] px-3 py-2.5">
                    <ShieldAlert className="h-4 w-4 shrink-0 text-[var(--danger)]" />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium">{entry.identifier}</span>
                      <div className="flex items-center gap-2 text-[0.6rem] text-[var(--muted)]">
                        <Globe className="h-3 w-3" /> {entry.ipAddress ?? "Unknown IP"}
                        <Monitor className="h-3 w-3" /> {formatUserAgent(entry.userAgent)}
                      </div>
                    </div>
                    <span className="text-[0.6rem] text-[var(--muted)]">{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card-flat rounded-2xl p-5">
            <h3 className="mb-3 text-sm font-semibold">Recent Login Activity</h3>
            <div className="space-y-1.5">
              {logins.slice(0, 30).map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                  {entry.success ? (
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[var(--success)]" />
                  ) : (
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-[var(--danger)]" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{entry.identifier}</span>
                  <span className="text-[var(--muted)]">{entry.ipAddress ?? "—"}</span>
                  <span className="text-[var(--muted)]">{new Date(entry.createdAt).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        /* Retention Controls */
        <>
          {retention && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="card-flat rounded-2xl p-4">
                  <p className="text-2xl font-bold">{retention.totalMessages.toLocaleString()}</p>
                  <p className="text-[0.7rem] text-[var(--muted)]">Total Messages</p>
                </div>
                <div className="card-flat rounded-2xl p-4">
                  <p className="text-2xl font-bold">{retention.messagesOlderThan90d.toLocaleString()}</p>
                  <p className="text-[0.7rem] text-[var(--muted)]">Messages &gt;90 days</p>
                </div>
                <div className="card-flat rounded-2xl p-4">
                  <p className="text-2xl font-bold">{retention.totalAttachments.toLocaleString()}</p>
                  <p className="text-[0.7rem] text-[var(--muted)]">Total Attachments</p>
                </div>
                <div className="card-flat rounded-2xl p-4">
                  <p className="text-2xl font-bold">{retention.attachmentsOlderThan90d.toLocaleString()}</p>
                  <p className="text-[0.7rem] text-[var(--muted)]">Attachments &gt;90 days</p>
                </div>
              </div>

              <div className="card-flat rounded-2xl p-5">
                <h3 className="mb-3 text-sm font-semibold">Data Retention</h3>
                <p className="mb-4 text-xs text-[var(--muted)]">
                  Messages and attachments older than the retention period can be cleaned up to reduce storage usage.
                </p>
                <div className="space-y-3">
                  {[
                    { label: "Messages older than 90 days", count: retention.messagesOlderThan90d },
                    { label: "Messages older than 180 days", count: retention.messagesOlderThan180d },
                    { label: "Attachments older than 90 days", count: retention.attachmentsOlderThan90d },
                    { label: "Old scheduled messages", count: retention.scheduledMessages },
                    { label: "Old audit log entries (>1 year)", count: retention.oldAuditLogs },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between rounded-xl border border-[var(--border)] px-4 py-3">
                      <span className="text-xs">{item.label}</span>
                      <span className="text-sm font-bold tabular-nums">{item.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-[0.65rem] text-[var(--muted)]">
                  Retention cleanup runs automatically. Manual cleanup can be triggered from the API.
                </p>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
