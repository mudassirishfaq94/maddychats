import type { Pool } from "pg";
export function testAuthFields(base: string, pool: Pool, username: string, password: string): Promise<void>;
