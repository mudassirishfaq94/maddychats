"use client";

import { useEffect, useState } from "react";
import {
  Clock,
  ShieldCheck,
  ShieldAlert,
  Monitor,
  Globe,
  Loader2,
} from "lucide-react";

interface LoginEntry {
  id: string;
  identifier: string;
  success: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

function formatUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari")) return "Safari";
  if (ua.includes("Edge")) return "Edge";
  if (ua.includes("Opera") || ua.includes("OPR")) return "Opera";
  return "Other browser";
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function LoginHistory() {
  const [history, setHistory] = useState<LoginEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/privacy/login-history")
      .then((r) => r.json())
      .then(setHistory)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const shown = expanded ? history : history.slice(0, 5);
  const successCount = history.filter((h) => h.success).length;
  const failCount = history.filter((h) => !h.success).length;

  return (
    <div className="card-glass rounded-2xl p-5 sm:p-6 animate-fade-up">
      <div className="flex items-center gap-2.5">
        <Clock className="h-4.5 w-4.5 text-[var(--accent)]" />
        <h2 className="text-sm font-bold">Login History</h2>
        {!loading && history.length > 0 && (
          <span className="ml-auto text-[0.65rem] text-[var(--muted)]">
            {successCount} successful, {failCount} failed
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--muted)]" />
        </div>
      ) : history.length === 0 ? (
        <p className="py-4 text-center text-xs text-[var(--muted)]">
          No login history yet.
        </p>
      ) : (
        <div className="mt-3 divide-y divide-[var(--border)]">
          {shown.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 py-2.5"
            >
              {entry.success ? (
                <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--success)]" />
              ) : (
                <ShieldAlert className="h-4 w-4 shrink-0 text-[var(--danger)]" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">
                  {entry.success ? "Successful login" : "Failed login attempt"}
                </p>
                <div className="mt-0.5 flex items-center gap-2 text-[0.65rem] text-[var(--muted)]">
                  <Globe className="h-3 w-3" />
                  <span>{entry.ipAddress || "Unknown IP"}</span>
                  <span>·</span>
                  <Monitor className="h-3 w-3" />
                  <span>{formatUserAgent(entry.userAgent)}</span>
                </div>
              </div>
              <span className="shrink-0 text-[0.65rem] text-[var(--muted)]">
                {formatTime(entry.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}

      {!loading && history.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-2 w-full rounded-xl py-2 text-center text-xs font-medium text-[var(--accent)] transition-colors hover:bg-[var(--surface-2)]"
        >
          {expanded ? "Show less" : `Show all (${history.length})`}
        </button>
      )}
    </div>
  );
}
