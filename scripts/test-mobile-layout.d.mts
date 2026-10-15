import type { Pool } from "pg";
import type { Page } from "playwright";
export function inspectMobileLayout(page: Page, label: string): Promise<Record<string, unknown>[]>;
export function testMobileLayout(base: string, pool: Pool, options?: {recordOnly?: boolean}): Promise<{screens: number; observations: Record<string, unknown>[]; browserErrors: string[]}>;
