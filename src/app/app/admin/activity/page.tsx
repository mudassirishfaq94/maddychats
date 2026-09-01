"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  UserPlus,
  LogIn,
  LogOut,
  Shield,
  Clock,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { timeAgo } from "@/lib/utils";

interface ActivityEntry {
  id: string;
  type: string;
  description: string;
  userId: string;
  userName: string;
  userUsername: string;
  createdAt: string;
}

export default function AdminActivityPage() {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const fetchActivities = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (filter !== "all") params.set("type", filter);
      const res = await fetch(`/api/admin/activity?${params}`);
      const data = await res.json();
      setActivities(data.activities ?? []);
      setPagination(data.pagination);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchActivities(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchActivities(1); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  function getIcon(type: string) {
    switch (type) {
      case "message": return <MessageSquare className="h-3.5 w-3.5 text-blue-500" />;
      case "user_created": return <UserPlus className="h-3.5 w-3.5 text-green-500" />;
      case "login": return <LogIn className="h-3.5 w-3.5 text-purple-500" />;
      case "logout": return <LogOut className="h-3.5 w-3.5 text-orange-500" />;
      case "admin_action": return <Shield className="h-3.5 w-3.5 text-red-500" />;
      default: return <Clock className="h-3.5 w-3.5 text-[var(--muted)]" />;
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Activity Logs</h1>
        <p className="mt-0.5 text-sm text-[var(--muted)]">
          Recent system activity and user actions.
        </p>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-1.5">
        {[
          { key: "all", label: "All" },
          { key: "message", label: "Messages" },
          { key: "login", label: "Logins" },
          { key: "user_created", label: "New Users" },
        ].map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.key
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--muted)]" />
        </div>
      ) : activities.length === 0 ? (
        <div className="py-12 text-center text-sm text-[var(--muted)]">
          No activity found.
        </div>
      ) : (
        <div className="space-y-1">
          {activities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[var(--surface-2)]"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)]">
                {getIcon(activity.type)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">{activity.userName}</span>{" "}
                  <span className="text-[var(--muted)]">{activity.description}</span>
                </p>
              </div>
              <span className="shrink-0 text-[0.65rem] text-[var(--muted)]">
                {timeAgo(activity.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={pagination.page <= 1}
            onClick={() => fetchActivities(pagination.page - 1)}
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
            onClick={() => fetchActivities(pagination.page + 1)}
            className="btn btn-ghost px-3 py-1.5 text-sm disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
