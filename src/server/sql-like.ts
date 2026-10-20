import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/** Substring match that treats %, _, and \\ as literals. */
export function ilikeContains(column: SQLWrapper, value: string): SQL {
  return sql`${column} ILIKE ${`%${escapeLike(value)}%`} ESCAPE '\\'`;
}

/** Prefix match that treats %, _, and \\ as literals. */
export function ilikePrefix(column: SQLWrapper, value: string): SQL {
  return sql`${column} ILIKE ${`${escapeLike(value)}%`} ESCAPE '\\'`;
}
