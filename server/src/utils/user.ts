import type { User } from "../generated/prisma/client.js";

/**
 * Public shape of a user returned by the API. Note: `passwordHash` is
 * deliberately absent and must NEVER be exposed through any endpoint.
 */
export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
};

/**
 * Strip sensitive fields (passwordHash) from a User before sending it to the
 * client. This is the single choke point for user serialization.
 */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastSeenAt: user.lastSeenAt.toISOString(),
  };
}
