import type { Pool } from "pg";
import type { Page } from "playwright";
export function testStatusPhoto(base: string, pool: Pool, owner: {id: string; username: string}, peer: {id: string; username: string}, source: {page: Page; cookies: string}, recipient: {page: Page; cookies: string}, unrelatedCookie: string): Promise<Record<string, boolean>>;
