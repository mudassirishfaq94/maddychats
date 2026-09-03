"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";
import { avatarHue, initials } from "@/lib/utils";

type AvatarUser = {
  displayName: string;
  username: string;
  avatarUrl: string | null;
};

function ProfilePhotoViewer({ user, onClose }: { user: AvatarUser; onClose: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  if (!user.avatarUrl) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${user.displayName}'s profile photo`}
      className="fixed inset-0 z-[200] flex flex-col bg-black/90 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <header className="flex h-16 shrink-0 items-center gap-3 px-4 text-white sm:px-6">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {user.displayName}
        </span>
        <a
          href={user.avatarUrl}
          download
          onClick={(event) => event.stopPropagation()}
          className="flex h-11 w-11 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Download profile photo"
        >
          <Download className="h-5 w-5" />
        </a>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Close profile photo"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div
        className="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <Image
          src={user.avatarUrl}
          alt={`${user.displayName}'s profile photo`}
          width={1200}
          height={1200}
          unoptimized
          priority
          className="h-auto max-h-full w-auto max-w-full rounded-2xl object-contain shadow-2xl"
        />
      </div>
    </div>,
    document.body,
  );
}

/** Generated initials fall back when the user has not uploaded a photo. */
export function Avatar({
  user,
  size = 36,
  ring = false,
  preview = true,
}: {
  user: AvatarUser;
  size?: number;
  ring?: boolean;
  preview?: boolean;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const hue = avatarHue(user.username);
  const style = {
    width: size,
    height: size,
    fontSize: size * 0.38,
    ...(user.avatarUrl
      ? {}
      : {
          background: `linear-gradient(135deg, hsl(${hue} 48% 46%), hsl(${(hue + 40) % 360} 44% 52%))`,
        }),
    ...(ring
      ? { boxShadow: "0 0 0 2px var(--bg), 0 0 0 4px var(--border-strong)" }
      : {}),
  };

  if (user.avatarUrl) {
    const image = (
      <Image
        src={user.avatarUrl}
        alt={user.displayName}
        width={size}
        height={size}
        unoptimized
        className="shrink-0 rounded-full object-cover"
        style={style}
      />
    );

    if (!preview) return image;

    return (
      <>
        <span
          role="button"
          tabIndex={0}
          aria-label={`View ${user.displayName}'s profile photo`}
          className="inline-flex shrink-0 cursor-zoom-in rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setViewerOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              setViewerOpen(true);
            }
          }}
        >
          {image}
        </span>
        {viewerOpen ? <ProfilePhotoViewer user={user} onClose={() => setViewerOpen(false)} /> : null}
      </>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white"
      style={style}
    >
      {initials(user.displayName)}
    </span>
  );
}
