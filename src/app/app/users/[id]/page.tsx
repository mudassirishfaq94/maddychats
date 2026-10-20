import { redirect } from "next/navigation";
import type { Metadata } from "next";
import type * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Ghost,
} from "lucide-react";
import { getSessionUser } from "@/server/session";
import { findUserById, toPublicUser } from "@/server/users";
import { AppShell } from "@/components/shell/app-shell";
import { StartConversationButton } from "@/components/chats/start-conversation-button";
import { Avatar } from "@/components/avatar";
import { formatDate, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login?next=/app/people");

  const { id } = await params;
  if (id === me.id) redirect("/app/profile");

  const target = await findUserById(id);

  return (
    <AppShell user={me}>
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-4 py-6 sm:px-6">
      <Link
        href="/app/people"
        className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--text)] animate-fade-up"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to people
      </Link>

      {!target ? (
        <section className="card-flat mt-6 rounded-3xl px-8 py-20 text-center animate-fade-up">
          <Ghost className="mx-auto h-9 w-9 text-[var(--muted)]" />
          <h1 className="font-display mt-4 text-2xl font-bold">
            Person not found
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--muted)]">
            This profile doesn&apos;t exist — the link may be outdated or the
            account was removed.
          </p>
          <Link href="/app/people" className="btn btn-secondary mx-auto mt-8">
            Search people
          </Link>
        </section>
      ) : (
        <>
          {(() => {
            const person = toPublicUser(target);
            // Live status is rendered by client presence surfaces (chat and
            // people search). This server page intentionally shows no stale
            // render-time approximation.
            const online = false;
            return (
              <>
                <section
                  className="card-glass mt-6 flex flex-col items-start gap-6 rounded-3xl p-8 sm:flex-row sm:items-center animate-fade-up"
                  style={{ "--d": "80ms" } as React.CSSProperties}
                >
                  <Avatar user={person} size={92} ring />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h1 className="font-display text-3xl font-bold">
                        {person.displayName}
                      </h1>
                      {online ? (
                        <span className="badge badge-accent">
                          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
                          Online
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 text-[var(--muted)]">@{person.username}</p>
                    <p className="mt-3 max-w-lg text-sm leading-relaxed text-[var(--muted)]">
                      {person.bio ?? "This person hasn't written a bio yet."}
                    </p>
                  </div>
                  <StartConversationButton userId={person.id} />
                </section>

                <section
                  className="mt-5 grid gap-4 sm:grid-cols-2 animate-fade-up"
                  style={{ "--d": "160ms" } as React.CSSProperties}
                >
                  <div className="card-flat rounded-2xl p-5">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                      <CalendarDays className="h-3.5 w-3.5 text-[var(--accent)]" />
                      Member since
                    </p>
                    <p className="mt-2.5 text-[0.95rem] font-medium">
                      {formatDate(person.createdAt)}
                    </p>
                  </div>
                  <div className="card-flat rounded-2xl p-5">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                      <Clock className="h-3.5 w-3.5 text-[var(--accent)]" />
                      Last seen
                    </p>
                    <p className="mt-2.5 text-[0.95rem] font-medium">
                      {person.lastSeenAt ? timeAgo(person.lastSeenAt) : "—"}
                    </p>
                  </div>
                </section>
              </>
            );
          })()}
        </>
      )}
    </div>
    </AppShell>
  );
}
