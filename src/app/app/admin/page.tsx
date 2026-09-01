"use client";

import { useEffect, useState } from "react";
import {
  Users,
  MessageSquare,
  MessagesSquare,
  UserCheck,
  UserX,
  TrendingUp,
  Activity,
  Loader2,
  Crown,
} from "lucide-react";

interface Stats {
  totals: {
    users: number;
    messages: number;
    conversations: number;
    groups: number;
    directMessages: number;
    bannedUsers: number;
  };
  activity: {
    activeLast24h: number;
    activeLast7d: number;
    activeLast30d: number;
    messagesToday: number;
    messagesThisWeek: number;
  };
  topUsers: Array<{
    userId: string;
    username: string;
    displayName: string;
    count: number;
  }>;
  charts: {
    messagesPerDay: Array<{ date: string; count: number }>;
    newUsersPerDay: Array<{ date: string; count: number }>;
  };
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--muted)]" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="py-20 text-center text-sm text-[var(--muted)]">
        Failed to load stats.
      </div>
    );
  }

  const statCards = [
    { label: "Total Users", value: stats.totals.users, icon: Users, color: "text-blue-500" },
    { label: "Total Messages", value: stats.totals.messages, icon: MessageSquare, color: "text-green-500" },
    { label: "Conversations", value: stats.totals.conversations, icon: MessagesSquare, color: "text-purple-500" },
    { label: "Active (24h)", value: stats.activity.activeLast24h, icon: Activity, color: "text-amber-500" },
    { label: "Messages Today", value: stats.activity.messagesToday, icon: TrendingUp, color: "text-teal-500" },
    { label: "Banned Users", value: stats.totals.bannedUsers, icon: UserX, color: "text-red-500" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Dashboard Overview</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          System-wide statistics and user activity.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="card-flat rounded-2xl p-4"
          >
            <card.icon className={`h-5 w-5 ${card.color}`} />
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {card.value.toLocaleString()}
            </p>
            <p className="text-[0.7rem] text-[var(--muted)]">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Activity Summary */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card-flat rounded-2xl p-5">
          <h3 className="mb-3 text-sm font-semibold">User Activity</h3>
          <div className="space-y-2.5">
            {[
              { label: "Active in last 24h", value: stats.activity.activeLast24h, total: stats.totals.users },
              { label: "Active in last 7 days", value: stats.activity.activeLast7d, total: stats.totals.users },
              { label: "Active in last 30 days", value: stats.activity.activeLast30d, total: stats.totals.users },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--muted)]">{item.label}</span>
                  <span className="font-medium">
                    {item.value} / {item.total}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{
                      width: `${item.total > 0 ? (item.value / item.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card-flat rounded-2xl p-5">
          <h3 className="mb-3 text-sm font-semibold">Message Activity</h3>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">Messages today</span>
              <span className="text-lg font-bold tabular-nums">{stats.activity.messagesToday}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">Messages this week</span>
              <span className="text-lg font-bold tabular-nums">{stats.activity.messagesThisWeek}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">Groups</span>
              <span className="text-lg font-bold tabular-nums">{stats.totals.groups}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">Direct messages</span>
              <span className="text-lg font-bold tabular-nums">{stats.totals.directMessages}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Users */}
      <div className="card-flat rounded-2xl p-5">
        <h3 className="mb-3 text-sm font-semibold">Top Users by Messages</h3>
        {stats.topUsers.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">No messages yet.</p>
        ) : (
          <div className="space-y-2">
            {stats.topUsers.map((user, i) => (
              <div key={user.userId} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[0.65rem] font-bold text-[var(--muted)]">
                  {i === 0 ? <Crown className="h-3 w-3 text-amber-500" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {user.displayName}
                </span>
                <span className="text-xs text-[var(--muted)]">@{user.username}</span>
                <span className="tabular-nums text-sm font-medium">{user.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Messages per day chart (simple bar chart) */}
      {stats.charts.messagesPerDay.length > 0 && (
        <div className="card-flat rounded-2xl p-5">
          <h3 className="mb-3 text-sm font-semibold">Messages per Day (Last 7 Days)</h3>
          <div className="flex items-end gap-2" style={{ height: 120 }}>
            {stats.charts.messagesPerDay.map((day) => {
              const maxCount = Math.max(...stats.charts.messagesPerDay.map((d) => d.count), 1);
              const height = (day.count / maxCount) * 100;
              return (
                <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[0.6rem] tabular-nums text-[var(--muted)]">{day.count}</span>
                  <div
                    className="w-full rounded-t bg-[var(--accent)]"
                    style={{ height: `${height}%`, minHeight: 4 }}
                  />
                  <span className="text-[0.55rem] text-[var(--muted)]">
                    {new Date(day.date).toLocaleDateString("en", { weekday: "short" })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
