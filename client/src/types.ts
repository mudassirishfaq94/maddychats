export type User = {
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

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";
