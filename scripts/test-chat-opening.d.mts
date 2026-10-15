import type { Page } from "playwright";
import type { Pool } from "pg";
export function testChatOpeningRace(sender: Page, recipient: Page): Promise<void>;
export function testChatOpeningFixture(base: string, pool: Pool, owner: { id: string; username: string }, peer: { id: string; username: string }, password: string, conversationId: string): Promise<void>;
