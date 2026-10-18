import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";

/** Owned fixture pages only. Geometry + hit testing catches paint-containment regressions. */
export async function testChatPolish(page, recipient) {
  const previous = page.viewportSize();
  const hitTest = async popup => {
    assert(await popup.evaluate(element => {
      const rect = element.getBoundingClientRect();
      if (rect.left < 0 || rect.top < 0 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1) return false;
      return Array.from(element.querySelectorAll("button")).filter(button => {
        const b = button.getBoundingClientRect(); return b.top >= rect.top && b.bottom <= rect.bottom;
      }).every(button => { const b = button.getBoundingClientRect(); return element.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)); });
    }), "Every visible menu item must be inside the viewport and above messages");
  };
  try {
    await page.setViewportSize({ width: 1280, height: 740 });
    const rows = page.locator('.message-history-row').filter({ has: page.getByRole("button", { name: "More actions", exact: true }) });
    const count = await rows.count(); assert(count > 1);
    const inspector = await page.context().newCDPSession(page);
    const documentObject = await inspector.send("Runtime.evaluate", { expression: "document" });
    const { listeners } = await inspector.send("DOMDebugger.getEventListeners", { objectId: documentObject.result.objectId });
    for (const type of ["mousedown", "keydown"]) assert(listeners.filter(listener => listener.type === type).length < 15, "Closed message actions cannot install global listeners per history row");
    for (const index of [...new Set([0, Math.floor(count / 2), count - 1])]) {
      const row = rows.nth(index); await row.scrollIntoViewIfNeeded(); await row.hover();
      await row.getByRole("button", { name: "More actions", exact: true }).click();
      const menu = page.getByRole("dialog", { name: "Message actions", exact: true }); await menu.waitFor(); await hitTest(menu);
      await page.keyboard.press("Escape"); await menu.waitFor({ state: "detached" });
      await row.getByRole("button", { name: "Add reaction", exact: true }).click();
      const reactions = page.getByRole("dialog", { name: "Message reactions", exact: true }); await reactions.waitFor(); await hitTest(reactions);
      await page.keyboard.press("Escape");
    }
    await mkdir(".freebuff/performance", { recursive: true });
    await rows.last().scrollIntoViewIfNeeded(); await rows.last().hover(); await rows.last().getByRole("button", { name: "More actions", exact: true }).click();
    await page.screenshot({ path: ".freebuff/performance/message-menu-polish.png" }); await page.keyboard.press("Escape");
    // A resize can land a document scroll right after the click; the popover legitimately
    // closes on scroll, so settle the resize and retry instead of treating that as a defect.
    const openChatOptions = async () => {
      const menu = page.getByRole("menu", { name: "Chat options", exact: true });
      for (let attempt = 0; ; attempt++) {
        assert(attempt < 3, "Chat options menu must stay open after being clicked");
        await page.getByRole("button", { name: "Chat options", exact: true }).click();
        try { await menu.waitFor({ timeout: 5000 }); return menu; }
        catch {
          await page.keyboard.press("Escape");
          await menu.waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
        }
      }
    };
    for (const viewport of [{ width: 320, height: 390 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const menu = await openChatOptions(); await hitTest(menu);
      await menu.getByRole("menuitem", { name: "Close chat", exact: true }).scrollIntoViewIfNeeded(); await hitTest(menu);
      await page.keyboard.press("Escape"); await menu.waitFor({ state: "detached" });
    }
    await page.route("**/api/conversations/*/controls", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "temporary" }) }));
    const beforeFailure = page.url();
    const failureMenu = await openChatOptions();
    await failureMenu.getByRole("menuitem", { name: "Close chat", exact: true }).click();
    await failureMenu.getByRole("alert").waitFor();
    assert.equal(page.url(), beforeFailure, "A failed archive must not silently navigate away");
    await page.keyboard.press("Escape"); await page.unroute("**/api/conversations/*/controls");
    const cdp = await page.context().newCDPSession(page);
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      const bubble = page.locator(".message-history-row .inline-block.rounded-2xl").last();
      const menu = page.getByRole("dialog", { name: "Message options", exact: true });
      const hold = async () => {
        await bubble.scrollIntoViewIfNeeded(); await bubble.click({trial:true});
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const point = await bubble.evaluate(element => {
          const box=element.getBoundingClientRect();let left=Math.max(0,box.left),right=Math.min(innerWidth,box.right),top=Math.max(0,box.top),bottom=Math.min(innerHeight,box.bottom);
          for(let parent=element.parentElement;parent;parent=parent.parentElement){const css=getComputedStyle(parent),rect=parent.getBoundingClientRect();if(css.overflowY!=="visible"){top=Math.max(top,rect.top);bottom=Math.min(bottom,rect.bottom);}if(css.overflowX!=="visible"){left=Math.max(left,rect.left);right=Math.min(right,rect.right);}}
          if(right<=left||bottom<=top)return null;const x=(left+right)/2,y=(top+bottom)/2;
          return element.contains(document.elementFromPoint(x,y))?{x,y}:null;
        });
        if (!point) {
          const geometry=await bubble.evaluate(element=>({viewport:{width:innerWidth,height:innerHeight},bubble:element.getBoundingClientRect().toJSON(),ancestors:Array.from((function*(){for(let p=element.parentElement;p;p=p.parentElement)yield p;})()).map(p=>({className:p.className,rect:p.getBoundingClientRect().toJSON(),overflow:getComputedStyle(p).overflow})),composer:document.querySelector('.composer-row')?.getBoundingClientRect().toJSON()}));
          console.error("Inaccessible message geometry:",JSON.stringify(geometry));
        }
        assert(point,"Long press targets the visible message, including clipped landscape images");
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
        try { await menu.waitFor({timeout:5000}); }
        catch(error) {
          const geometry=await bubble.evaluate(element=>({viewport:{width:innerWidth,height:innerHeight},bubble:element.getBoundingClientRect().toJSON(),history:element.closest('.message-history-row')?.getBoundingClientRect().toJSON(),composer:document.querySelector('.composer-row')?.getBoundingClientRect().toJSON()}));
          await mkdir('.freebuff/performance',{recursive:true});
          const {writeFile}=await import('node:fs/promises');await writeFile('.freebuff/performance/long-press-failure.json',JSON.stringify(geometry,null,2));
          throw error;
        } finally { await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); }
      };
      await hold();
      for (const action of ["Edit", "Star", "Pin", "Reply", "Forward", "React"]) assert.equal(await menu.getByRole("button",{name:action,exact:true}).count(),1,"Compact touch menus retain " + action);
      if(viewport.width===390){
        for(const action of ["Star","Unstar"]){
          const response=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith("/star")&&r.request().method()===(action==="Star"?"POST":"DELETE"));
          await menu.getByRole("button",{name:action,exact:true}).click();const result=await response;assert.equal(result.status(),200);assert.equal((await result.json()).message.starred,action==="Star");await menu.waitFor({state:"detached"});await hold();
        }
        for(const action of ["Pin","Unpin"]){
          const response=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith("/pin")&&r.request().method()===(action==="Pin"?"POST":"DELETE"));
          await menu.getByRole("button",{name:action,exact:true}).click();assert.equal((await response).status(),200);await menu.waitFor({state:"detached"});await hold();
        }
        await menu.getByRole("button",{name:"Edit",exact:true}).click();await menu.waitFor({state:"detached"});
        const editing=page.locator(".message-history-row").filter({has:page.locator("textarea")});await editing.locator("textarea").waitFor();assert((await editing.locator("textarea").inputValue()).trim());
        await editing.getByRole("button",{name:"Cancel",exact:true}).click();await hold();
      }
      await menu.getByRole("button", { name: "Cancel", exact: true }).scrollIntoViewIfNeeded();
      assert(await menu.getByRole("button", { name: "Cancel", exact: true }).isVisible());
      await page.keyboard.press("Escape"); await menu.waitFor({ state: "detached" });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const files = page.locator('input[type="file"]').first();
    const photo = await readFile(new URL("../public/icons/circlo-192.png", import.meta.url));
    await files.setInputFiles([{ name: "polish-preview.png", mimeType: "image/png", buffer: photo }, { name: "polish-note.txt", mimeType: "text/plain", buffer: Buffer.from("Owned review fixture") }]);
    const review = page.getByRole("dialog", { name: "Review attachments", exact: true }); await review.waitFor();
    const caption = review.getByRole("textbox", { name: "Attachment caption", exact: true });
    await caption.fill("A caption worth keeping");
    await review.getByRole("button", { name: "Preview polish-note.txt", exact: true }).click();
    await review.getByRole("button", { name: "Remove polish-note.txt", exact: true }).click();
    assert.equal(await caption.inputValue(), "A caption worth keeping");
    for (const viewport of [{ width: 320, height: 740 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert(await review.evaluate(element => element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1), "Review must fit portrait and landscape");
      await hitTest(review);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: ".freebuff/performance/attachment-review-polish.png" });
    await page.route("**/api/upload/message", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary upload interruption. Your selection is safe." }) }));
    await review.getByRole("button", { name: "Send attachments", exact: true }).click();
    await review.getByRole("alert").getByText("Temporary upload interruption. Your selection is safe.", { exact: true }).waitFor();
    assert.equal(await caption.inputValue(), "A caption worth keeping");
    await page.unroute("**/api/upload/message");
    await page.evaluate(() => { const encrypt = crypto.subtle.encrypt.bind(crypto.subtle); window.polishOriginalEncrypt = encrypt; crypto.subtle.encrypt = async (...args) => { await new Promise(resolve => setTimeout(resolve, 800)); return encrypt(...args); }; });
    let uploads = 0; const track = request => { if (request.url().endsWith("/api/upload/message") && request.method() === "POST") uploads++; }; page.on("request", track);
    await review.getByRole("button", { name: "Send attachments", exact: true }).click();
    await review.getByRole("button", { name: "Cancel upload", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('button[aria-label="Send attachments"]')?.disabled);
    page.off("request", track); assert.equal(uploads, 0, "Cancelling encryption must prevent a later request");
    await page.evaluate(() => { crypto.subtle.encrypt = window.polishOriginalEncrypt; delete window.polishOriginalEncrypt; });
    await page.keyboard.press("Escape"); await review.waitFor({ state: "detached" });
    assert.equal(await page.getByRole("textbox", { name: "Message text", exact: true }).inputValue(), "A caption worth keeping");
    await page.getByRole("textbox", { name: "Message text", exact: true }).fill("");
    const video = await page.evaluate(async () => {
      const canvas = document.createElement("canvas"); canvas.width = 240; canvas.height = 160;
      const paint = canvas.getContext("2d"), stream = canvas.captureStream(10), chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      const stopped = new Promise(resolve => { recorder.onstop = resolve; }); recorder.start(100);
      for (let frame = 0; frame < 6; frame++) { paint.fillStyle = frame % 2 ? "#343042" : "#74543a"; paint.fillRect(0, 0, 240, 160); paint.fillStyle = "white"; paint.font = "24px sans-serif"; paint.fillText("Private video", 35, 85); await new Promise(resolve => setTimeout(resolve, 100)); }
      recorder.stop(); await stopped; stream.getTracks().forEach(track => track.stop());
      return Array.from(new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer()));
    });
    await files.setInputFiles({ name: "polish-video.webm", mimeType: "video/webm", buffer: Buffer.from(video) });
    await review.waitFor(); await review.locator("video").waitFor();
    await page.waitForFunction(() => document.querySelector('dialog[aria-label="Review attachments"] video')?.readyState >= 1);
    await review.getByRole("textbox", { name: "Attachment caption", exact: true }).fill("An encrypted video caption");
    const accepted = page.waitForResponse(response => response.url().endsWith("/api/upload/message") && response.request().method() === "POST");
    await review.getByRole("button", { name: "Send attachments", exact: true }).click();
    const response = await accepted; assert.equal(response.status(), 201);
    const packet = await response.json(); assert(packet.message.encrypted); assert(!packet.message.text.includes("An encrypted video caption"));
    await recipient.getByText("An encrypted video caption", { exact: true }).waitFor();
    await recipient.getByRole("button", { name: "View polish-video.webm", exact: true }).click();
    const player = recipient.getByRole("dialog", { name: "polish-video.webm", exact: true }).locator("video"); await player.waitFor();
    await player.evaluate(async element => { await element.play(); });
    await recipient.waitForFunction(() => document.querySelector('div[role="dialog"][aria-label="polish-video.webm"] video')?.currentTime > 0);
    await recipient.keyboard.press("Escape");
    await testChatWallpapers(page);
    console.log("PASS unclipped message/reaction/header menus with hit testing, responsive media review, caption retention, failed upload recovery and pre-upload cancellation");
  } finally { await page.unroute("**/api/upload/message"); await page.setViewportSize(previous); }
}


/** Real settings API + rendered CSS, owned fixture chats only. */
async function testChatWallpapers(page) {
  const chat = new URL(page.url()).pathname.match(/\/app\/chats\/([^/]+)/)?.[1];
  assert(chat);
  const endpoint = new URL(`/api/conversations/${chat}/background`, page.url()).href;
  const origin = new URL(page.url()).origin;
  const wasLight = await page.evaluate(() => document.documentElement.classList.contains("light"));
  const samples = ["default", "ocean", "#000000", "#ffffff", "doodle:classic,nature:#a78bfa:#101828:1", "photo"];
  try {
    for (const style of samples) {
      const response = await page.request.patch(endpoint, { headers: { Origin: origin }, ...(style === "photo" ? { multipart: { file: { name: "wallpaper.png", mimeType: "image/png", buffer: await readFile("public/icons/circlo-192.png") } } } : { data: { backgroundStyle: style, backgroundOpacity: 100 } }) });
      assert.equal(response.status(), 200);
      await page.reload(); await page.locator(".chat-bubble").first().waitFor();
      for (const light of [false, true]) {
        await page.evaluate(light => document.documentElement.classList.toggle("light", light), light);
        for (const viewport of [{ width: 320, height: 740 }, { width: 844, height: 390 }]) {
          await page.setViewportSize(viewport);
          const result = await page.evaluate(String.raw`(() => {
            const luminance = value => {
              const channels = value.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
              return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
            };
            const ratio = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
            return {
              overflow: document.documentElement.scrollWidth > innerWidth + 1,
              ratios: Array.from(document.querySelectorAll(".chat-bubble")).map(bubble => {
                const css = getComputedStyle(bubble);
                const probe = document.createElement("span"); probe.style.color = "var(--muted)"; bubble.append(probe);
                const muted = getComputedStyle(probe).color; probe.remove();
                return { text: ratio(css.color, css.backgroundColor), metadata: ratio(muted, css.backgroundColor), alpha: css.backgroundColor };
              }),
              pattern: getComputedStyle(document.querySelector(".chat-message-area")).backgroundImage,
            };
          })()`);
          assert.equal(result.overflow, false, `${style}: no horizontal overflow`);
          assert(result.ratios.every(value => value.text >= 4.5 && value.metadata >= 4.5), `${style}/${light}: readable bubble text and metadata: ${JSON.stringify(result.ratios)}`);
          if (style === "default") assert.notEqual(result.pattern, "none", "Default has a signature wallpaper");
        }
      }
    }
    console.log("PASS real wallpaper settings: dark/light palettes, black/white/gradient/doodle backgrounds, text and timestamp contrast >=4.5:1, 320px portrait and touch landscape");
  } finally {
    await page.request.patch(endpoint, { headers: { Origin: origin }, data: { backgroundStyle: null, backgroundOpacity: 100 } });
    await page.reload(); await page.locator(".chat-bubble").first().waitFor();
    await page.evaluate(light => document.documentElement.classList.toggle("light", light), wasLight);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: ".freebuff/performance/circlo-signature-wallpaper.png" });
  }
}
