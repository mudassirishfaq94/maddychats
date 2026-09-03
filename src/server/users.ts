import { and, asc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { notificationPreferences, users, type UserRow } from "@/db/schema";
import type { PublicUser, SafeUser } from "@/lib/types";
import type { ProfileUpdateInput } from "@/lib/schemas";

/**
 * Strips every sensitive column (notably `passwordHash`) before a user
 * crosses an API/serialization boundary — the ONLY shape an owner receives
 * for their own account.
 */
export function toSafeUser(user: UserRow): SafeUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastSeenAt: user.lastSeenAt ? user.lastSeenAt.toISOString() : null,
  };
}

/**
 * Public profile shape for OTHER users — additionally drops the private
 * email address. Used by search and public profile views.
 */
export function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    createdAt: user.createdAt.toISOString(),
    lastSeenAt: user.lastSeenAt ? user.lastSeenAt.toISOString() : null,
  };
}

/** Loose uuid check — keeps invalid ids out of the database layer. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const rows = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`)
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserByUsername(
  username: string,
): Promise<UserRow | null> {
  const rows = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = ${username.trim().toLowerCase()}`)
    .limit(1);
  return rows[0] ?? null;
}

/** Login accepts either an email address or a username. */
export async function findUserByIdentifier(
  identifier: string,
): Promise<UserRow | null> {
  const id = identifier.trim();
  if (!id) return null;
  return id.includes("@") ? findUserByEmail(id) : findUserByUsername(id);
}

export async function findUserById(id: string): Promise<UserRow | null> {
  if (!isUuid(id)) return null;
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createUser(input: {
  displayName: string;
  username: string;
  email: string;
  passwordHash: string;
}): Promise<UserRow> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .insert(users)
      .values({
        displayName: input.displayName.trim(),
        username: input.username.trim(),
        email: input.email.trim().toLowerCase(),
        passwordHash: input.passwordHash,
      })
      .returning();
    await tx.insert(notificationPreferences).values({ userId: rows[0].id });
    return rows[0];
  });
}

export async function touchLastSeen(id: string): Promise<void> {
  await db
    .update(users)
    .set({ lastSeenAt: new Date() })
    .where(eq(users.id, id));
}

/**
 * Applies a profile edit. Unique-constraint violations (username race) are
 * surfaced as a tagged error the route can translate into a 409.
 */
export async function updateUserProfile(
  id: string,
  input: ProfileUpdateInput,
): Promise<UserRow> {
  const patch: Partial<typeof users.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.displayName !== undefined) {
    patch.displayName = input.displayName.trim();
  }
  if (input.username !== undefined) {
    patch.username = input.username.trim();
  }
  if (input.bio !== undefined) {
    const bio = input.bio.trim();
    patch.bio = bio === "" ? null : bio;
  }

  const rows = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, id))
    .returning();
  if (!rows[0]) throw new Error("user_not_found");
  return rows[0];
}

/**
 * People search — matches username and display name (case-insensitive
 * substring), never returns the searcher themselves, capped for safety.
 */
export async function searchUsers(
  query: string,
  excludeUserId: string,
  limit = 20,
): Promise<UserRow[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const pattern = `%${trimmed}%`;
  const prefix = `${trimmed}%`;
  // Rank results: exact match > starts-with > contains
  // This gives the most relevant results first
  return db
    .select()
    .from(users)
    .where(
      and(
        ne(users.id, excludeUserId),
        or(
          ilike(users.username, pattern),
          ilike(users.displayName, pattern),
        ),
      ),
    )
    .orderBy(
      sql`
        CASE
          WHEN lower(${users.displayName}) = lower(${trimmed}) THEN 0
          WHEN lower(${users.displayName}) LIKE lower(${prefix}) THEN 1
          WHEN lower(${users.username}) LIKE lower(${prefix}) THEN 2
          WHEN lower(${users.displayName}) LIKE lower(${pattern}) THEN 3
          ELSE 4
        END,
        ${users.displayName}
      `,
    )
    .limit(limit);
}
