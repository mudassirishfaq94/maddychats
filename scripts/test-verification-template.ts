import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { verificationEmail } from "../src/server/verification-email-template";

async function main() {
  const browser=await chromium.launch();
  try {
    await mkdir(".freebuff/email-preview",{recursive:true});
    const page=await browser.newPage();
    await page.route("**/brand/circlo-email.png",route=>readFile("public/brand/circlo-email.png").then(body=>route.fulfill({contentType:"image/png",body})));
    const {html,text}=verificationEmail("123456","https://example.invalid");
    assert(text.includes("123456") && text.includes("10 minutes"));
    for(const width of [320,390,600]) {
      await page.setViewportSize({width,height:900});await page.setContent(html);
      await page.locator("img").evaluate((image:HTMLImageElement)=>image.decode());
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.equal(await page.getByText("123456",{exact:true}).isVisible(),true);
      await page.screenshot({path:`.freebuff/email-preview/${width}.png`,fullPage:true});
    }
    console.log("Verification email preview passed at 320, 390 and 600px: complete logo, readable code, no horizontal overflow; HTML/plain text generated. Actual email clients not tested.");
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
