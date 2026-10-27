import { fixtureAppSession } from "./fixture-app-session.mjs";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import bcrypt from "bcryptjs";
import { TOTP, Secret } from "otpauth";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

/** Inspect controls, not just document width: the shell deliberately clips overflow. */
export async function inspectMobileLayout(page, label) {
  return page.evaluate(label => {
    const problems = [];
    const dialogs = [...document.querySelectorAll('[role="dialog"], [role="complementary"]')].filter(node => node.checkVisibility({checkVisibilityCSS:true}) && (node.getAttribute("role") === "dialog" || getComputedStyle(node).position === "fixed"));
    const dialog = dialogs.at(-1);
    for (const node of document.querySelectorAll("button, a.btn, input:not([type=hidden]), select, textarea, summary")) {
      if (dialog && !dialog.contains(node)) continue;
      const box = node.getBoundingClientRect();
      if (!node.checkVisibility({ checkVisibilityCSS: true }) || box.width < 4 || box.height < 4 || node.closest('[inert], [aria-hidden="true"]') || node.classList.contains("sr-only")) continue;
      let scroller = null;
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        const css = getComputedStyle(parent);
        if (["auto", "scroll"].includes(css.overflowX) && parent.scrollWidth > parent.clientWidth + 2) { scroller = parent; break; }
      }
      const name = (node.getAttribute("aria-label") || node.textContent || node.getAttribute("placeholder") || node.tagName).trim().replace(/\s+/g, " ").slice(0, 100);
      if (!scroller && (box.left < -2 || box.right > innerWidth + 2)) problems.push({ label, name, issue: "outside viewport", x: box.x, width: box.width, viewport: innerWidth });
      if (node.matches("button, a.btn") && node.scrollWidth > node.clientWidth + 3) problems.push({ label, name, issue: "label clipped", width: box.width, contentWidth: node.scrollWidth });
      const card = node.closest('section, [role="dialog"], .card-flat, .card-glass');
      if (card && !scroller) {
        const container = card.getBoundingClientRect();
        if (box.left < container.left - 2 || box.right > container.right + 2) problems.push({ label, name, issue: "outside card", width: box.width, cardWidth: container.width });
      }
      if (node.matches("button") && (box.width < 43.5 || box.height < 43.5)) problems.push({ label, name, issue: "small touch target", width: box.width, height: box.height });
      if (node.matches("button:not(:disabled), a.btn, summary") && getComputedStyle(node).pointerEvents !== "none") {
        const x = box.left + box.width / 2, y = box.top + box.height / 2;
        let clipped = false;
        for (let parent = node.parentElement; parent; parent = parent.parentElement) {
          const css = getComputedStyle(parent), rect = parent.getBoundingClientRect();
          if (css.overflowY !== "visible" && (y < rect.top || y > rect.bottom)) clipped = true;
          if (css.overflowX !== "visible" && (x < rect.left || x > rect.right)) clipped = true;
        }
        if (!clipped && x >= 0 && x < innerWidth && y >= 0 && y < innerHeight) {
          const hit = document.elementFromPoint(x, y);
          if (hit && hit !== node && !node.contains(hit)) problems.push({label, name, issue:"covered touch target", coveredBy:hit.tagName + "." + hit.className});
        }
      }
      // Controls below the fold are valid only if a scrollable ancestor can expose them.
      if (node.closest('[role="dialog"], .dialog-backdrop')) {
        let canScroll = false;
        for (let parent = node.parentElement; parent; parent = parent.parentElement) { const css = getComputedStyle(parent); if (["auto", "scroll"].includes(css.overflowY)) { canScroll = true; break; } if (css.position === "fixed") break; }
        if (!canScroll && (box.bottom > innerHeight + 2 || box.top < -2)) problems.push({ label, name, issue: "unreachable dialog control", y: box.y, height: box.height, viewportHeight: innerHeight });
      }
    }
    return problems;
  }, label);
}

async function expandDetails(page, scope = page) {
  for (let depth = 0; depth < 5; depth++) {
    const closed = scope.locator('details:not([open]) > summary:visible');
    const count = await closed.count();
    if (!count) break;
    for (let index = 0; index < count; index++) {
      const next = scope.locator('details:not([open]) > summary:visible').first();
      if (await next.count()) await next.click();
    }
    await page.waitForTimeout(100);
  }
}

async function testNavigationSpace(page) {
  const settings = await page.context().newPage();
  await settings.goto(new URL("/app/settings#two-step-verification", page.url()).toString());
  const enable = settings.getByRole("button", { name: "Enable two-factor authentication", exact: true });
  await enable.waitFor({ state: "visible" });
  const twoFactor = settings.locator("#two-step-verification");
  const measurements = [];
  for (const [width, height] of [[320, 740], [360, 800], [390, 844]]) {
    for (const fontSize of [20, 16, 24]) {
      for (const inset of [0, 32]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(({ fontSize, inset }) => {
          document.documentElement.style.fontSize = `${fontSize}px`;
          // Simulate a phone's additional bottom safe-area padding, without
          // claiming desktop Chromium emulates the Android window manager.
          document.querySelector('nav[aria-label="Mobile navigation"]').style.paddingBottom = `${inset}px`;
        }, { fontSize, inset });
        await expandDetails(page);
        const boundary = await page.evaluate(() => {
          const content = document.querySelector("#main-content > :first-child").getBoundingClientRect();
          const nav = document.querySelector('nav[aria-label="Mobile navigation"]').getBoundingClientRect();
          return { contentBottom: content.bottom, navTop: nav.top, navBottom: nav.bottom, height: innerHeight };
        });
        measurements.push({ width, height, fontSize, inset, ...boundary });
        assert(boundary.contentBottom <= boundary.navTop + 1, `Content overlaps mobile navigation: ${JSON.stringify(measurements.at(-1))}`);
        assert(boundary.navBottom <= boundary.height + 1);
        await settings.setViewportSize({ width, height });
        await settings.evaluate(({ fontSize, inset }) => {
          document.documentElement.style.fontSize = `${fontSize}px`;
          document.querySelector('nav[aria-label="Mobile navigation"]').style.paddingBottom = `${inset}px`;
        }, { fontSize, inset });
        await expandDetails(settings);
        const settingsBoundary = await settings.evaluate(() => {
          const content = document.querySelector("#main-content > :first-child").getBoundingClientRect();
          const nav = document.querySelector('nav[aria-label="Mobile navigation"]').getBoundingClientRect();
          return { contentBottom: content.bottom, navTop: nav.top, navBottom: nav.bottom, height: innerHeight };
        });
        assert(settingsBoundary.contentBottom <= settingsBoundary.navTop + 1, `Settings content overlaps mobile navigation: ${JSON.stringify({ width, height, fontSize, inset, ...settingsBoundary })}`);
        assert(settingsBoundary.navBottom <= settingsBoundary.height + 1);
        await enable.scrollIntoViewIfNeeded(); await enable.click({ trial: true });
        const recover = page.getByRole("button", { name: "Use email code and sign out other devices", exact: true });
        await recover.scrollIntoViewIfNeeded();
        assert(await recover.evaluate(node => {
          const box = node.getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return hit === node || node.contains(hit);
        }), "Recovery confirmation remains visible without bypassing its disabled verification gate");
        // Real keyboard focus traversal, with a smaller visual layout to model
        // space lost to a keyboard. Physical Android IME behavior is separate.
        await settings.setViewportSize({ width, height: height - 300 });
        await twoFactor.getByLabel("Current password", { exact: true }).focus();
        await settings.keyboard.press("Tab");
        const codeInput = twoFactor.getByLabel("Code from your code app or saved backup list (if enabled)", { exact: true });
        assert(await codeInput.evaluate(node => node === document.activeElement));
        await enable.click({ trial: true });
      }
    }
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
    document.querySelector('nav[aria-label="Mobile navigation"]').style.removeProperty("padding-bottom");
  });
  await settings.close();
  await mkdir(".freebuff/performance", { recursive: true });
  await writeFile(".freebuff/performance/mobile-navigation.json", JSON.stringify(measurements, null, 2));
  console.log("PASS mobile navigation: 18 viewport/font/safe-area combinations, recovery/MFA hit testing and keyboard focus with reduced viewport; physical Android IME not asserted");
  return measurements.length;
}

export async function testMobileLayout(base, pool, { recordOnly = false, navigationOnly = false } = {}) {
  assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Broad audit runs only on disposable local data");
  const browser = await chromium.launch();
  // Dedicated documentation address isolates login counters in the loopback fixture gateway.
  const fixtureHeaders = {"X-Forwarded-For":"198.51.100.231"};
  const accounts = [], errors = [], observations = [], screens = [];
  const password = "Aa9" + randomBytes(20).toString("hex"), tag = randomBytes(5).toString("hex");
  const check = async (page, label) => { screens.push(label); observations.push(...await inspectMobileLayout(page, label)); if (screens.length % 20 === 0) console.log("Mobile layout audit:", screens.length, "states checked"); };
  try {
    const hash = await bcrypt.hash(password, 12);
    for (const role of ["user", "admin"]) accounts.push((await pool.query("insert into users(username,display_name,email,email_verified_at,password_hash,role) values($1,$2,$3,now(),$4,$5) returning id,username", ["layoutqa_" + tag + role, "Avery".repeat(12), "layoutqa_" + tag + role + "@example.invalid", hash, role])).rows[0]);
    const login = async (user, mfaCode) => {
      let response = await fetch(base + "/api/auth/login", { method: "POST", headers: { ...fixtureHeaders, Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ acceptTerms: true, acceptPrivacy: true, identifier: user.username, password }) });
      assert.equal(response.status, 200);
      if (mfaCode) {
        assert.equal((await response.json()).mfaRequired, true);
        const challenge = response.headers.getSetCookie().find(cookie => cookie.startsWith("maddy_mfa_challenge=")).split(";")[0];
        response = await fetch(base + "/api/auth/mfa", {method:"POST",headers:{...fixtureHeaders,Origin:base,Cookie:challenge,"Content-Type":"application/json"},body:JSON.stringify({code:mfaCode})});
        assert.equal(response.status, 200);
      }
      const context = await browser.newContext({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true, serviceWorkers: "block", extraHTTPHeaders: fixtureHeaders });
      await fixtureAppSession(pool, response);
      await context.addCookies(response.headers.getSetCookie().filter(c => /^(maddy_session|maddy_refresh)=/.test(c)).map(c => { const i = c.indexOf("="); return { name: c.slice(0,i), value: c.slice(i+1).split(";")[0], url: base, httpOnly: true, sameSite: "Lax" }; }));
      const page = await context.newPage(); page.setDefaultTimeout(30000); page.on("pageerror", e => errors.push(e.message));
      return page;
    };
    await mkdir(".freebuff/performance", { recursive: true });
    const user = await login(accounts[0]);
    await user.goto(base + "/app/profile#encryption-devices");
    await user.getByText("This device: Linked", { exact: true }).waitFor();
    const pending = await login(accounts[0]);
    await pending.goto(base + "/app/profile#encryption-devices");
    await pending.getByText("This device: Waiting for approval", { exact: true }).waitFor();
    await pending.getByRole("button", { name: "Get back in without my old device", exact: true }).click();
    const navigationScreens = await testNavigationSpace(pending);
    if (navigationOnly) { assert.deepEqual(errors, []); return { screens: navigationScreens, observations: [], browserErrors: errors }; }
    const group = (await pool.query("insert into conversations(type,name,description,created_by_id) values('group',$1,$2,$3) returning id", ["Circle".repeat(16), "Long mobile group description ".repeat(8), accounts[0].id])).rows[0];
    await pool.query("insert into conversation_members(conversation_id,user_id,role,accepted_at) values($1,$2,'owner',now())", [group.id, accounts[0].id]);
    for (const [width,height] of [[320,740],[360,800],[390,844],[412,915],[768,1024],[844,390],[390,360]]) {
      const size = `${width}x${height}`;
      await pending.setViewportSize({ width, height });
      await expandDetails(pending);
      await check(pending, "pending-recovery-" + size);
      if (width === 320) {
        await pending.evaluate(() => {document.documentElement.style.fontSize = "20px";});
        await check(pending, "pending-recovery-large-text-" + size);
        await pending.evaluate(() => {document.documentElement.style.fontSize = "";});
      }
      await pending.getByRole("button", { name: "Use email code and sign out other devices", exact: true }).scrollIntoViewIfNeeded();
      if (width === 320) { await pending.screenshot({ path: ".freebuff/performance/mobile-recovery-320.png", fullPage: true }); }
      await user.setViewportSize({ width, height });
      for (const path of ["/app", "/app/chats", "/app/profile", "/app/settings", "/app/people", "/app/status", "/app/communities", "/app/starred", `/app/users/${accounts[1].id}`, `/app/chats/${group.id}`]) {
        assert.equal((await user.goto(base + path)).status(), 200, path); await user.waitForTimeout(100);
        if (path === "/app/profile" || path === "/app/settings") await expandDetails(user);
        await check(user, path + "-" + size);
        if (path === "/app/settings") {
          await user.getByRole("button", { name: "Delete my account", exact: true }).click();
          await user.getByPlaceholder("Type DELETE", {exact:true}).fill("DELETE");
          const remove = user.getByRole("dialog", {name:"Delete account",exact:true}).getByRole("button",{name:"Delete permanently",exact:true});
          await remove.scrollIntoViewIfNeeded();
          await remove.click({trial:true});
          await check(user, "delete-confirmation-" + size);
          await user.getByRole("dialog", { name: "Delete account", exact: true }).getByRole("button").first().click();
          if (width === 320) {
            const two = user.locator(".card-glass").filter({has:user.getByRole("heading",{name:"Two-Factor Authentication",exact:true})}).last();
            await two.getByLabel("Current password", {exact:true}).fill(password);
            await two.getByRole("button",{name:"Enable two-factor authentication",exact:true}).click();
            await two.getByPlaceholder("000000",{exact:true}).waitFor();
            await check(user, "two-factor-setup-" + size);
            await two.getByRole("button",{name:"Cancel setup",exact:true}).click();
          }
        }
        if (path === "/app/communities") {
          await user.getByRole("button", { name: "Create community", exact: true }).click();
          await user.getByPlaceholder("Community name", {exact:true}).fill("Mobile audit fixture");
          await user.getByRole("dialog",{name:"Create community",exact:true}).getByRole("button",{name:"Create",exact:true}).click({trial:true});
          await check(user, "community-editor-" + size);
          await user.getByRole("dialog", { name: "Create community", exact: true }).getByRole("button",{name:"Cancel",exact:true}).click();
        }
        if (path === `/app/chats/${group.id}`) {
          // Model the viewport delivered by the native IME inset handler;
          // this is geometry coverage, not proof of a physical Android keyboard.
          await user.evaluate(()=>{document.documentElement.dataset.keyboardOpen="true";});
          await user.setViewportSize({width,height:Math.min(height,420)});
          const geometry=await user.evaluate(()=>{
            const header=document.querySelector('a[aria-label="Back to chats"]')?.closest('header')?.getBoundingClientRect();
            const composer=document.querySelector('.composer-row')?.getBoundingClientRect();
            const messages=document.querySelector('[aria-label="Messages"]')?.getBoundingClientRect();
            return {header:header?.toJSON(),composer:composer?.toJSON(),messages:messages?.toJSON(),height:innerHeight};
          });
          assert(geometry.header&&geometry.header.top>=0&&geometry.header.bottom<=geometry.height,"Chat header stays visible when keyboard reduces viewport");
          assert(geometry.composer&&geometry.composer.bottom<=geometry.height+1,"Composer stays above keyboard viewport");
          assert(geometry.messages&&geometry.messages.height>0,"History retains a scrollable viewport");
          await user.evaluate(()=>{delete document.documentElement.dataset.keyboardOpen;});await user.setViewportSize({width,height});
          await user.getByRole("button", { name: "Open group settings", exact: true }).click();
          await user.getByRole("button", { name: "Group settings", exact: true }).click();
          await expandDetails(user, user.getByRole("complementary",{name:"Conversation details",exact:true})); await check(user, "group-details-" + size);
          await user.getByRole("button", {name:"Close details",exact:true}).click();
          await user.getByRole("button", {name:"Emoji",exact:true}).click();
          const picker = user.getByRole("dialog",{name:"Emoji, stickers and GIFs",exact:true});
          await picker.waitFor();
          await check(user, "emoji-picker-" + size);
          for (const tab of ["Stickers", "GIFs"]) {
            await picker.getByRole("tab",{name:tab,exact:true}).click();
            await check(user, tab.toLowerCase() + "-picker-" + size);
          }
          await picker.getByRole("button",{name:"Close media picker",exact:true}).click();
        }
        if (path === "/app/chats") {
          await user.getByRole("button", { name: "New chat", exact: true }).click(); await check(user, "new-chat-" + size);
          await user.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
          await user.getByRole("button", { name: "New group", exact: true }).click(); await check(user, "new-group-" + size);
        }
        if (path === "/app/status") {
          await user.getByRole("button", { name: "Add photo status", exact: true }).click(); await check(user, "status-editor-" + size);
        }
      }
    }
    const adminSetup = await login(accounts[1]);
    const setup = await adminSetup.request.post(base + "/api/privacy/2fa/setup", {headers:{Origin:base}, data:{password}});
    assert.equal(setup.status(), 200);
    const secret = (await setup.json()).secret;
    const code = new TOTP({secret:Secret.fromBase32(secret)}).generate();
    const verified = await adminSetup.request.post(base + "/api/privacy/2fa/verify", {headers:{Origin:base},data:{password,code}});
    assert.equal(verified.status(), 200);
    const recovery = (await verified.json()).recoveryCodes[0];
    const admin = await login(accounts[1], recovery);
    await adminSetup.context().close();
    for (const width of [320,390,844]) {
      await admin.setViewportSize({ width, height: width === 844 ? 390 : 800 });
      for (const path of ["/app/admin", "/app/admin/users", "/app/admin/messages", "/app/admin/reports", "/app/admin/audit", "/app/admin/activity", "/app/admin/security", "/app/admin/storage"]) { assert.equal((await admin.goto(base + path)).status(), 200, path); await check(admin, path + "-" + width);
        if (path === "/app/admin") {
          await admin.getByRole("button", {name:"Open admin navigation",exact:true}).click();
          await admin.getByRole("button", {name:"Close admin navigation",exact:true}).click({trial:true});
          await check(admin, "admin-navigation-" + width);
          await admin.getByRole("button", {name:"Close admin navigation",exact:true}).click();
        } }
    }
    const publicContext = await browser.newContext({isMobile:true,hasTouch:true,serviceWorkers:"block"});
    const publicPage = await publicContext.newPage(); publicPage.on("pageerror", e => errors.push(e.message));
    for (const width of [320,390,844]) {
      await publicPage.setViewportSize({ width, height: width === 844 ? 390 : 800 });
      for (const path of ["/", "/login", "/signup", "/forgot-password", "/reset-password", "/verify-email", "/privacy", "/terms", "/device-migration"]) { assert.equal((await publicPage.goto(base + path)).status(), 200, path); await check(publicPage, path + "-" + width); }
    }
    const report = { screens: screens.length, observations, browserErrors: errors };
    await mkdir(".freebuff/performance", { recursive: true });
    await writeFile(`.freebuff/performance/mobile-layout-${recordOnly ? "before" : "after"}.json`, JSON.stringify(report, null, 2));
    if (!recordOnly) { assert.deepEqual(errors, []); assert.deepEqual(observations, [], "Every visible control must fit and be reachable"); }
    return report;
  } finally {
    await browser.close();
    for (const account of accounts) { await pool.query("delete from conversations where created_by_id=$1", [account.id]); await pool.query("delete from users where id=$1 and username=$2 and username like 'layoutqa_%'", [account.id, account.username]); }
  }
}
