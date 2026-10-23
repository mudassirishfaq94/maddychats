"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function JoinGroupButton({ code }: { code: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <div className="mt-4">
    <button type="button" disabled={busy} className="btn btn-primary min-h-11" onClick={async () => {
      setBusy(true); setError(null);
      try {
        const response = await fetch("/api/groups/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }), signal: AbortSignal.timeout(15000) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Couldn't join. Try again.");
        router.push(`/app/chats/${result.conversationId}`); router.refresh();
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't join. Try again."); setBusy(false); }
    }}>{busy ? "Joining…" : "Join group"}</button>
    {error ? <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
  </div>;
}
