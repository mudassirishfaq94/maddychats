import assert from "node:assert/strict";
import { chromium } from "playwright";
import { measureChatWallpaper } from "./test-chat-polish.mjs";

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const viewport of [{ width: 320, height: 740 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await page.setContent(`<!doctype html><style>
        html,body { margin:0; }
        .chat-message-area { height:100px; background-image:linear-gradient(black,white); }
        .chat-bubble { background-color:rgb(0,0,0); color:rgb(255,255,255); --muted:rgb(255,255,255); }
      </style><div class="chat-message-area"></div><div class="chat-bubble">Synthetic message</div>`);
      const wallpaper = page.locator(".chat-message-area");
      const result = await wallpaper.evaluate(measureChatWallpaper);
      assert(result && typeof result === "object", "Locator callback must return the measurement object");
      assert.equal(result.overflow, false);
      assert.equal(result.ratios.length, 1);
      assert.equal(result.ratios[0].text, 21);
      assert.equal(result.ratios[0].metadata, 21);
      assert.match(result.pattern, /linear-gradient/);
  
      await page.locator(".chat-bubble").evaluate(bubble => {
        bubble.style.color = "rgb(10,10,10)";
        bubble.style.setProperty("--muted", "rgb(10,10,10)");
      });
      const lowContrast = await wallpaper.evaluate(measureChatWallpaper);
      assert(lowContrast.ratios[0].text < 4.5 && lowContrast.ratios[0].metadata < 4.5,
        "Measurement must still detect unreadable message text and metadata");
      await page.evaluate(width => { document.body.style.width = `${width + 30}px`; }, viewport.width);
      assert.equal((await wallpaper.evaluate(measureChatWallpaper)).overflow, true,
        "Measurement must still detect horizontal overflow");
    }
    console.log("PASS wallpaper callback: real locator result, numeric contrast, low-contrast detection, background and overflow at portrait/landscape widths");
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
