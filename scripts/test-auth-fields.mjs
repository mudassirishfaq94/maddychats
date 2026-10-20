import assert from "node:assert/strict";
import { chromium } from "playwright";

/** Disposable DB only; no mail or third-party requests. */
export async function testAuthFields(base, pool, username, password) {
  assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
  const form = { displayName: "Test User", username, email: "unused_auth_fields@example.invalid", password, confirmPassword: password, acceptTerms: true, acceptPrivacy: true };
  const post = (path, body) => fetch(base + path, { method: "POST", headers: { origin: base, "content-type": "application/json", "x-forwarded-for": "198.18.8.20" }, body: JSON.stringify(body) });
  for (const value of [username, username.toUpperCase()]) {
    const response = await post("/api/auth/register", { ...form, username: value });
    assert.equal(response.status, 409); assert.equal(response.headers.getSetCookie().length, 0);
    const data = await response.json(); assert.equal(data.suggestions.length, 3);
    for (const suggestion of data.suggestions) {
      assert(/^[a-z0-9_]{3,20}$/.test(suggestion));
      assert.equal((await pool.query("select id from users where lower(username)=lower($1)", [suggestion])).rowCount, 0);
    }
  }
  for (const patch of [{ username: "ab" }, { username: "bad<script>" }, { email: "not-an-email" }, { displayName: " " }, { password: "weak" }, { confirmPassword: "different" }, { acceptTerms: false }, { acceptPrivacy: false }]) {
    const response = await post("/api/auth/register", { ...form, ...patch }); assert.equal(response.status, 422); assert.equal(response.headers.getSetCookie().length, 0);
  }
  assert.equal((await pool.query("select id from users where email=$1", [form.email])).rowCount, 0);
  const raceName = "auth_race_" + Date.now().toString(36);
  try {
    const results = await Promise.all([0, 1].map(index => post("/api/auth/register", { ...form, username: index ? raceName.toUpperCase() : raceName, email: `${raceName}${index}@example.invalid` })));
    assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
    assert(results.every(result => result.headers.getSetCookie().length === 0));
    assert.equal((await pool.query("select id from users where lower(username)=lower($1)", [raceName])).rowCount, 1);
  } finally { await pool.query("delete from users where lower(username)=lower($1)", [raceName]); }
  const invalidLogin = await post("/api/auth/login", { identifier: "x".repeat(255), password, acceptTerms: true, acceptPrivacy: true });
  assert.equal(invalidLogin.status, 422); assert.equal(invalidLogin.headers.getSetCookie().length, 0);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true });
    await page.goto(base + "/signup");
    for (const [label, value] of [["Display name", form.displayName], ["Username", username], ["Email", form.email], ["Password", password], ["Confirm password", password]]) await page.getByLabel(label, { exact: true }).fill(value);
    for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await page.getByText("Available now — tap a username to use it:", { exact: true }).waitFor();
    assert(new URL(page.url()).pathname === "/signup");
    const suggestion = page.getByRole("button", { name: new RegExp(`^${username.slice(0,14)}_\\d{5}$`) }).first();
    const selected = await suggestion.innerText(); await suggestion.click();
    assert.equal(await page.getByLabel("Username", { exact: true }).inputValue(), selected);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  } finally { await browser.close(); }
  console.log("PASS signup duplicate/case collision, checked suggestions, field validation and mobile selection; no account or session created");
}
