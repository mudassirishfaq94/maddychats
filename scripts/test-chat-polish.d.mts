import type { Page } from "playwright";

export type WallpaperMeasurement = {
  overflow: boolean;
  ratios: Array<{ text: number; metadata: number; alpha: string }>;
  pattern: string;
};

export function measureChatWallpaper(wallpaper: Element): WallpaperMeasurement;
export function testChatPolish(page: Page, recipient: Page): Promise<void>;
