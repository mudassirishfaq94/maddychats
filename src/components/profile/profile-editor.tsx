"use client";

import { useState, type FormEvent } from "react";
import { useRef } from "react";
import {
  AlertTriangle,
  AtSign,
  CheckCircle2,
  Camera,
  Loader2,
  PenLine,
  Quote,
  User,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { useRouter } from "next/navigation";
import type { SafeUser } from "@/lib/types";
import { fieldErrors, MAX_BIO_LENGTH, profileUpdateSchema } from "@/lib/schemas";
import { useAuth } from "@/components/providers/auth-provider";
import { cn } from "@/lib/utils";

/**
 * Profile settings card — edit display name, username (uniqueness enforced
 * server-side), and bio. Email is shown read-only.
 */
export function ProfileEditor({ user }: { user: SafeUser }) {
  const router = useRouter();
  const { refresh } = useAuth();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    displayName: user.displayName,
    username: user.username,
    bio: user.bio ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  async function uploadAvatar(file: File) {
    setAvatarBusy(true);
    setFormError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload/avatar", { method: "POST", body });
      const data = (await res.json().catch(() => null)) as {
        user?: SafeUser;
        error?: string;
      } | null;
      if (!res.ok) {
        setFormError(data?.error ?? "Avatar upload failed.");
        return;
      }
      setSaved(true);
      await refresh();
      router.refresh();
    } catch {
      setFormError("Network error during avatar upload.");
    } finally {
      setAvatarBusy(false);
    }
  }

  const dirty =
    form.displayName.trim() !== user.displayName ||
    form.username.trim() !== user.username ||
    form.bio.trim() !== (user.bio ?? "");

  function beginEdit() {
    setForm({
      displayName: user.displayName,
      username: user.username,
      bio: user.bio ?? "",
    });
    setErrors({});
    setFormError(null);
    setSaved(false);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setErrors({});
    setFormError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaved(false);

    const payload: Record<string, string> = {};
    if (form.displayName.trim() !== user.displayName)
      payload.displayName = form.displayName;
    if (form.username.trim() !== user.username) payload.username = form.username;
    if (form.bio.trim() !== (user.bio ?? "")) payload.bio = form.bio;

    const parsed = profileUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);

    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = (await res.json().catch(() => null)) as {
        user?: SafeUser;
        error?: string;
        fields?: Record<string, string>;
      } | null;

      if (!res.ok) {
        setFormError(data?.error ?? "Something went wrong. Please try again.");
        if (data?.fields) setErrors(data.fields);
        return;
      }

      if (data?.user) {
        setForm({
          displayName: data.user.displayName,
          username: data.user.username,
          bio: data.user.bio ?? "",
        });
      }
      setSaved(true);
      setEditing(false);
      await refresh();
      router.refresh();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="card-glass rounded-3xl p-6 sm:p-8 animate-fade-up"
      style={{ "--d": "160ms" } as React.CSSProperties}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Profile settings</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            How you appear across Maddy Chats.
          </p>
        </div>
        {!editing ? (
          <button type="button" onClick={beginEdit} className="btn btn-secondary">
            <PenLine className="h-4 w-4" />
            Edit profile
          </button>
        ) : null}
      </div>

      <div className="mt-6 flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card-2)] p-4">
        <span className="relative">
          <Avatar user={user} size={56} ring />
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarBusy}
            aria-label="Change avatar"
            className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--card-2)] text-white"
            style={{ background: "var(--accent)" }}
          >
            {avatarBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
          </button>
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Profile photo</p>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">
            JPG, PNG, WEBP or GIF — up to 5 MB. Stored on the server, served
            through the authenticated media endpoint.
          </p>
        </div>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadAvatar(f);
            e.target.value = "";
          }}
        />
      </div>

      {saved && !editing ? (
        <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--success)_40%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] px-4 py-3 text-sm text-[var(--success)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Profile updated.
        </div>
      ) : null}

      {formError ? (
        <div
          role="alert"
          className="mt-5 flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-4 py-3 text-sm text-[var(--danger)]"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{formError}</span>
        </div>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
        {/* display name */}
        <div>
          <label htmlFor="pe-display" className="field-label">
            Display name
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]">
              <User className="h-4 w-4" />
            </span>
            <input
              id="pe-display"
              className="field-input field-input--icon"
              value={form.displayName}
              onChange={(e) =>
                setForm((f) => ({ ...f, displayName: e.target.value }))
              }
              disabled={!editing || pending}
              data-invalid={Boolean(errors.displayName)}
              autoComplete="name"
            />
          </div>
          {errors.displayName ? (
            <p className="field-error">{errors.displayName}</p>
          ) : null}
        </div>

        {/* username */}
        <div>
          <label htmlFor="pe-username" className="field-label">
            Username
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]">
              <AtSign className="h-4 w-4" />
            </span>
            <input
              id="pe-username"
              className="field-input field-input--icon"
              value={form.username}
              onChange={(e) =>
                setForm((f) => ({ ...f, username: e.target.value }))
              }
              disabled={!editing || pending}
              data-invalid={Boolean(errors.username)}
              autoComplete="username"
            />
          </div>
          {errors.username ? (
            <p className="field-error">{errors.username}</p>
          ) : (
            <p className="field-hint">
              Unique across Maddy Chats — letters, numbers, underscores.
            </p>
          )}
        </div>

        {/* bio */}
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="pe-bio" className="field-label">
              Bio
            </label>
            <span
              className={cn(
                "text-xs tabular-nums",
                form.bio.length > MAX_BIO_LENGTH
                  ? "text-[var(--danger)]"
                  : "text-[var(--muted)]",
              )}
            >
              {form.bio.length}/{MAX_BIO_LENGTH}
            </span>
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-3.5 text-[var(--muted)]">
              <Quote className="h-4 w-4" />
            </span>
            <textarea
              id="pe-bio"
              rows={3}
              className="field-input field-input--icon resize-none"
              placeholder="Tell people a little about yourself…"
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              disabled={!editing || pending}
              data-invalid={Boolean(errors.bio)}
              maxLength={MAX_BIO_LENGTH + 20}
            />
          </div>
          {errors.bio ? <p className="field-error">{errors.bio}</p> : null}
        </div>

        {/* email — read only */}
        <div>
          <span className="field-label">Email</span>
          <div className="card-flat flex items-center justify-between gap-3 rounded-xl px-4 py-3">
            <span className="truncate text-sm text-[var(--muted)]">
              {user.email}
            </span>
            <span className="badge shrink-0">verified sign-in</span>
          </div>
          <p className="field-hint">
              Your email address can’t be changed here yet.
          </p>
        </div>

        {editing ? (
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={pending || !dirty}
              className="btn btn-primary flex-1"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {pending ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              className="btn btn-ghost"
            >
              Cancel
            </button>
          </div>
        ) : null}
      </form>
    </section>
  );
}
