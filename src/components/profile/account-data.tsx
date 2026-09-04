"use client";

import { useState } from "react";
import {
  Download,
  Trash2,
  Loader2,
  AlertTriangle,
  CheckCircle,
  X,
} from "lucide-react";

export function AccountDataSection() {
  const [exporting, setExporting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/privacy/export");
      if (!res.ok) throw new Error("Export failed");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `maddy-chats-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to export data. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirm !== "DELETE") return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/privacy/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete account.");
      }
      setDeleted(true);
      setTimeout(() => {
        window.location.href = "/login";
      }, 2000);
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="card-glass rounded-2xl p-5 sm:p-6 animate-fade-up">
      <div className="flex items-center gap-2.5">
        <Download className="h-4.5 w-4.5 text-[var(--accent)]" />
        <h2 className="text-sm font-bold">Your Data</h2>
      </div>

      <p className="mt-2 text-xs text-[var(--muted)]">
        Download a copy of your account data or delete your account permanently.
      </p>

      <div className="mt-4 space-y-3">
        {/* Export */}
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:opacity-50"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {exporting ? "Exporting..." : "Download my data"}
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={() => setShowDelete(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--danger)] px-4 py-2.5 text-sm font-medium text-[var(--danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
        >
          <Trash2 className="h-4 w-4" />
          Delete my account
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card-glass w-full max-w-md rounded-3xl p-6 animate-fade-up">
            {deleted ? (
              <div className="flex flex-col items-center py-6 text-center">
                <CheckCircle className="h-12 w-12 text-[var(--success)]" />
                <h3 className="mt-4 text-lg font-bold">Account Deleted</h3>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Your account and all associated data have been permanently
                  removed.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-[var(--danger)]" />
                    <h3 className="text-base font-bold">Delete Account</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDelete(false);
                      setDeleteConfirm("");
                      setDeleteError("");
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 rounded-xl bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] p-4 text-xs text-[var(--danger)]">
                  <p className="font-semibold">This action is permanent and cannot be undone.</p>
                  <ul className="mt-2 space-y-1">
                    <li>• All your messages will be deleted</li>
                    <li>• All your conversations will be removed</li>
                    <li>• Your profile and avatar will be deleted</li>
                    <li>• All your uploaded media will be removed</li>
                    <li>• You will be permanently logged out</li>
                  </ul>
                </div>

                <div className="mt-4">
                  <p className="mb-1.5 text-xs text-[var(--muted)]">
                    Type <span className="font-bold text-[var(--danger)]">DELETE</span> to confirm:
                  </p>
                  <input
                    type="text"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder="Type DELETE"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--danger)] focus:outline-none"
                  />
                </div>

                {deleteError && (
                  <p className="mt-2 text-xs text-[var(--danger)]">{deleteError}</p>
                )}

                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDelete(false);
                      setDeleteConfirm("");
                    }}
                    className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface-2)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleteConfirm !== "DELETE" || deleting}
                    className="rounded-xl bg-[var(--danger)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {deleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Delete permanently"
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
