import type { Pool } from "pg";
export function testPwaNotifications(base: string, pool: Pool): Promise<Record<string, boolean>>;
