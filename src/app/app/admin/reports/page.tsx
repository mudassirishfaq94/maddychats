"use client";

import { useEffect, useState } from "react";
import {
  Flag,
  Loader2,
  CheckCircle,
  XCircle,
  Eye,
  Filter,
} from "lucide-react";

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
  pending: "text-amber-500 bg-amber-500/10",
  reviewed: "text-blue-500 bg-blue-500/10",
  resolved: "text-green-500 bg-green-500/10",
  dismissed: "text-gray-500 bg-gray-500/10",
};

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const fetchReports = () => {
    const url = filter ? `/api/admin/reports?status=${filter}` : "/api/admin/reports";
    fetch(url)
      .then((r) => r.json())
      .then(setReports)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchReports();
  }, [filter]);

  const updateStatus = async (reportId: string, status: string) => {
    setReviewingId(reportId);
    try {
      await fetch("/api/admin/reports", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, status, reviewNote: reviewNote.trim() || undefined }),
      });
      setReviewNote("");
      fetchReports();
    } catch {
      alert("Failed to update report.");
    } finally {
      setReviewingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Reports</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Review user and message reports.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-[var(--muted)]" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--text)]"
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="reviewed">Reviewed</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--muted)]" />
        </div>
      ) : reports.length === 0 ? (
        <div className="card-flat rounded-2xl py-16 text-center">
          <Flag className="mx-auto h-8 w-8 text-[var(--muted)]" />
          <p className="mt-3 text-sm text-[var(--muted)]">No reports found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <div
              key={report.id}
              className="card-flat rounded-2xl p-4 sm:p-5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${STATUS_COLORS[report.status] || ""}`}
                    >
                      {report.status}
                    </span>
                    <span className="text-[0.65rem] text-[var(--muted)]">
                      {report.type}
                    </span>
                    <span className="text-[0.65rem] text-[var(--muted)]">
                      ·
                    </span>
                    <span className="text-[0.65rem] text-[var(--muted)]">
                      {report.reason}
                    </span>
                  </div>

                  <p className="mt-2 text-xs">
                    <span className="font-medium">{report.reporter.displayName}</span>
                    <span className="text-[var(--muted)]"> reported </span>
                    {report.targetUser ? (
                      <span className="font-medium">{report.targetUser.displayName}</span>
                    ) : (
                      <span className="text-[var(--muted)]">a message</span>
                    )}
                  </p>

                  {report.description && (
                    <p className="mt-1.5 rounded-lg bg-[var(--surface-2)] p-2.5 text-xs text-[var(--muted)]">
                      &ldquo;{report.description}&rdquo;
                    </p>
                  )}

                  <p className="mt-1.5 text-[0.6rem] text-[var(--muted)]">
                    {new Date(report.createdAt).toLocaleString()}
                  </p>
                </div>

                {report.status === "pending" && (
                  <div className="flex flex-col gap-2 sm:items-end">
                    <input
                      type="text"
                      value={reviewingId === report.id ? reviewNote : ""}
                      onChange={(e) => {
                        setReviewingId(report.id);
                        setReviewNote(e.target.value);
                      }}
                      placeholder="Review note (optional)"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs focus:border-[var(--accent)] focus:outline-none sm:w-48"
                    />
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateStatus(report.id, "resolved")}
                        disabled={reviewingId === report.id}
                        className="flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-[0.65rem] font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        <CheckCircle className="h-3 w-3" />
                        Resolve
                      </button>
                      <button
                        type="button"
                        onClick={() => updateStatus(report.id, "dismissed")}
                        disabled={reviewingId === report.id}
                        className="flex items-center gap-1 rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5 text-[0.65rem] font-medium text-[var(--muted)] hover:bg-[var(--surface)] disabled:opacity-50"
                      >
                        <XCircle className="h-3 w-3" />
                        Dismiss
                      </button>
                    </div>
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
