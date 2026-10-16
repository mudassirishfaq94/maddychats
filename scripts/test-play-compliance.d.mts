import type { Pool } from "pg";
type Account = { id: string; username: string };
export function testPlayCompliance(context: {
  base: string;
  sql: Pool;
  api: (path: string, cookie?: string, method?: string, body?: unknown, headers?: Record<string, string>) => Promise<Response>;
  account: (name: string) => Promise<Account>;
  login: (username: string) => Promise<string>;
}): Promise<void>;
