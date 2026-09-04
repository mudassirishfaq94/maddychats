"use client";

import { useState } from "react";
import { Ban, X, Flag, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";

const REASONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "hate_speech", label: "Hate speech" },
  { value: "violence", label: "Violence" },
  { value: "nudity", label: "Nudity" },
  { value: "misinformation", label: "Misinformation" },
  { value: "impersonation", label: "Impersonation" },
  { value: "scam", label: "Scam" },
  { value: "other", label: "Other" },
];

interface ReportDialogProps {
  type: "user" | "message";
  targetUserId?: string;
  targetMessageId?: string;
  targetName?: string;
  onClose: () => void;
}

export function ReportDialog({
  type,
  targetUserId,
  targetMessageId,
  targetName,
  onClose,
}: ReportDialogProps) {
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [blockAfter, setBlockAfter] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!reason) {
      setError("Please select a reason.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          reason,
          description: description.trim() || undefined,
          targetUserId,
          targetMessageId,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit report.");
      }
      setSubmitted(true);

      // Block the user after reporting if requested
      if (blockAfter && targetUserId) {
        try {
          await fetch(`/api/users/${targetUserId}/block`, { method: "POST" });
        } catch {
          // Block failed but report succeeded — don't worry user about it
        }
      }

      setTimeout(onClose, 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card-glass w-full max-w-md rounded-3xl p-6 animate-fade-up">
        {submitted ? (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle className="h-12 w-12 text-[var(--success)]" />
            <h3 className="mt-4 text-lg font-bold">Report Submitted</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Thank you for helping keep Maddy Chats safe. We&apos;ll review your
              report.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flag className="h-4.5 w-4.5 text-[var(--danger)]" />
                <h3 className="text-base font-bold">
                  Report {type === "user" ? "User" : "Message"}
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {targetName && (
              <p className="mt-2 text-sm text-[var(--muted)]">
                Reporting: <span className="font-medium text-[var(--text)]">{targetName}</span>
              </p>
            )}

            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Reason *
              </p>
              <div className="grid grid-cols-3 gap-2">
                {REASONS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setReason(r.value)}
                    className={`rounded-xl border px-2 py-2 text-xs font-medium transition-colors ${
                      reason === r.value
                        ? "border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)]"
                        : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Additional details (optional)
              </p>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide any additional context..."
                rows={3}
                className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none"
              />
            </div>

            {targetUserId && (
              <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
                <Ban className="h-4 w-4 shrink-0 text-[var(--danger)]" />
                <span className="flex-1 text-xs">
                  <span className="font-medium">Block this user</span>
                  <span className="ml-1 text-[var(--muted)]">after submitting</span>
                </span>
                <Toggle checked={blockAfter} onChange={setBlockAfter} label="Block this user" size="small" activeColor="bg-[var(--danger)]" />
              </div>
            )}

            {error && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] p-3 text-xs text-[var(--danger)]">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface-2)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !reason}
                className="rounded-xl bg-[var(--danger)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Submit Report"
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
