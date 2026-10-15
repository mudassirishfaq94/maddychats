import type { Pool } from "pg";
export function testDeviceAccess(base: string, pool: Pool, secret: string): Promise<void>;
