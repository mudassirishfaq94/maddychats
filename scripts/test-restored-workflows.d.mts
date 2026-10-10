import type { Pool } from "pg";
export function testRestoredWorkflows(base: string, pool: Pool, owner: { id: string; username: string }, peer: { id: string; username: string }, password: string, conversationId: string, ownedLive?: boolean): Promise<Record<string, boolean | number>>;
