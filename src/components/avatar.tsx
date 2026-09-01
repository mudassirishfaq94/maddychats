import Image from "next/image";
import { avatarHue, initials } from "@/lib/utils";

/**
 * Deterministic generated avatar: initials over a gradient derived from the
 * username. Falls back to `avatarUrl` imagery once profiles support uploads.
 */
export function Avatar({
  user,
  size = 36,
  ring = false,
}: {
  user: { displayName: string; username: string; avatarUrl: string | null };
  size?: number;
  ring?: boolean;
}) {
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
    return (
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
