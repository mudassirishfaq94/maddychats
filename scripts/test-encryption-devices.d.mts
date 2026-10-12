import type { Pool } from "pg";
export function testEncryptionDevices(base: string, pool: Pool, owner: { id: string; username: string }, peer: { id: string; username: string }, password: string, conversationId: string, jwtSecret: string, existing?: unknown): Promise<Record<string, boolean | number>>;
