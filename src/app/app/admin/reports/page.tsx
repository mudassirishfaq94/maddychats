"use client";

import { useEffect, useState } from "react";
import { Flag, Loader2, CheckCircle, XCircle, Clock, ExternalLink } from "lucide-react";

interface Report {
  id: string;
  type: string;
  reason: string;
  description: string | null;
  status: string;
  createdAt: string;
  reporter: { id: string; displayName: string; username: string };
  targetUser: { id: string; displayName: string; username: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  reviewed: "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700",
  dismissed: "bg-gray-100 text-gray-500",
};

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [busyId, setBusyId] = useState<string | null>(null);

  function loadReports(status: string) {
    setLoading(true);
    setFilter(status);
    fetch(`/api/admin/reports?status=${status}`)
      .then((r) => r.json())
      .then((data) => setReports(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadReports("pending"); }, []);

  async function updateStatus(reportId: string, status: string) {
    setBusyId(reportId);
    try {
      await fetch("/api/admin/reports", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, status }),
      });
      setReports((prev) => prev.filter((r) => r.id !== reportId));
    } catch {}
    setBusyId(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Report Review Queue</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Review user and message reports.</p>
      </div>

      <div className="flex gap-2">
        {["pending", "reviewed", "resolved", "dismissed", "all"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => loadReports(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === s
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[var(--muted)]" /></div>
      ) : reports.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--muted)]">No reports in this category.</p>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <div key={report.id} className="card-flat rounded-2xl p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <Flag className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">
                        {report.type === "user" ? "User Report" : "Message Report"}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-semibold ${STATUS_COLORS[report.status] ?? ""}`}>
                        {report.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Reason: <span className="font-medium text-[var(--text)]">{report.reason}</span>
                    </p>
                    {report.description && (
                      <p className="mt-1 text-xs text-[var(--muted)]">&ldquo;{report.description}&rdquo;</p>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-[0.65rem] text-[var(--muted)]">
                      <span>By: {report.reporter.displayName} (@{report.reporter.username})</span>
                      {report.targetUser && (
                        <span>→ {report.targetUser.displayName} (@{report.targetUser.username})</span>
                      )}
                      <span>{new Date(report.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {report.status === "pending" && (
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => void updateStatus(report.id, "resolved")}
                      disabled={busyId === report.id}
                      className="flex h-8 items-center gap-1 rounded-lg bg-[color-mix(in_srgb,var(--success)_10%,transparent)] px-2.5 text-xs font-medium text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_18%,transparent)]"
                    >
                      <CheckCircle className="h-3.5 w-3.5" /> Resolve
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateStatus(report.id, "dismissed")}
                      disabled={busyId === report.id}
                      className="flex h-8 items-center gap-1 rounded-lg bg-[var(--surface-2)] px-2.5 text-xs font-medium text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--muted)_12%,transparent)]"
                    >
                      <XCircle className="h-3.5 w-3.5" /> Dismiss
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
