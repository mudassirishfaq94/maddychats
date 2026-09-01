import { redirect } from "next/navigation";
import type { Metadata } from "next";
import type * as React from "react";
import { getSessionUser } from "@/server/session";
import { AppShell } from "@/components/shell/app-shell";
import { PeopleSearch } from "@/components/people/people-search";
import { Users } from "lucide-react";

export const metadata: Metadata = { title: "People" };
export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/app/people");

  return (
    <AppShell user={user}>
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-4 py-6 sm:px-6">
      <section className="animate-fade-up">
        <span className="badge badge-accent">
          <Users className="h-3.5 w-3.5" />
          Directory
        </span>
        <h1 className="font-display mt-4 text-[2.2rem] font-bold leading-tight">
          Find <span className="text-accent">people</span>
        </h1>
        <p className="mt-2.5 max-w-md text-[0.95rem] leading-relaxed text-[var(--muted)]">
          Search by username or display name, view a profile, or start a direct
          conversation.
        </p>
      </section>

      <div className="mt-8">
        <PeopleSearch />
      </div>
    </div>
    </AppShell>
  );
}
