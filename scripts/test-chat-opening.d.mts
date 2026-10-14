import type { Page } from "playwright";
export function testChatOpeningRace(sender: Page, recipient: Page): Promise<void>;
export function testChatOpeningFixture(base: string, owner: { id: string; username: string }, peer: { id: string; username: string }, password: string, conversationId: string): Promise<void>;
