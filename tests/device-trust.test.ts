import { test } from "node:test";
import assert from "node:assert/strict";
import { browserLabel, countryFlag, countryName, platformLabel } from "../src/server/device-meta";
import { LINK_CODE_LENGTH, generateLinkCode, linkCodeHash, normalizeLinkCode } from "../src/server/device-link-code";

const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const EDGE_LINUX = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0";
const CHROME_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1";

test("the device list labels a sign-in by browser and operating system", () => {
  assert.equal(browserLabel(CHROME_WINDOWS), "Chrome on Windows");
  assert.equal(browserLabel(SAFARI_IPHONE), "Safari on iPhone");
  // Edge advertises both Chrome and Safari, and iOS Chrome is not desktop Chrome.
  assert.equal(browserLabel(EDGE_LINUX), "Edge on Linux");
  assert.equal(browserLabel(CHROME_IOS), "Chrome on iPhone");
  assert.equal(browserLabel(null), null);
});

test("the platform family is still used when no user agent is recorded", () => {
  assert.equal(platformLabel(CHROME_WINDOWS), "Desktop browser");
  assert.equal(platformLabel(SAFARI_IPHONE), "iOS app");
  assert.equal(platformLabel(null), "Unknown device");
  // A client-supplied platform hint decides the family when the user agent cannot.
  assert.equal(platformLabel(null, "android"), "Android browser");
  assert.equal(platformLabel(null, "ios"), "iOS browser");
});

test("countries render as a name and, when possible, a flag", () => {
  assert.equal(countryName("PK"), "Pakistan");
  assert.equal(countryName("pk"), "Pakistan");
  assert.equal(countryName(null), "Not set");
  // An unknown code is shown as-is rather than silently dropped.
  assert.equal(countryName("ZZ"), "ZZ");
  assert.equal(countryFlag("PK"), "🇵🇰");
  assert.equal(countryFlag(""), "");
  assert.equal(countryFlag("P1"), "");
});

test("linking codes avoid characters that are misread across devices", () => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const code = generateLinkCode();
    assert.equal(code.length, LINK_CODE_LENGTH);
    assert.equal(normalizeLinkCode(code), code);
    // I, L, O and U are never emitted, so 0/O and 1/I/L cannot be confused.
    assert(!/[ILOU]/.test(code));
  }
});

test("a pasted code is accepted once and never widened", () => {
  const code = generateLinkCode();
  assert.equal(normalizeLinkCode(code.toLowerCase()), code);
  assert.equal(normalizeLinkCode(` ${code.slice(0, 4)}-${code.slice(4)} `), code);
  // Only the length and alphabet we issue pass, so guesses cannot be padded.
  assert.equal(normalizeLinkCode(code.slice(0, LINK_CODE_LENGTH - 1)), null);
  assert.equal(normalizeLinkCode(`${code}A`), null);
  assert.equal(normalizeLinkCode("!!!!!!!!"), null);
  assert.equal(normalizeLinkCode(null), null);
  assert.equal(normalizeLinkCode(""), null);
});

test("only the code hash is comparable, and it is stable", () => {
  const code = generateLinkCode();
  assert.equal(linkCodeHash(code), linkCodeHash(code));
  assert.notEqual(linkCodeHash(code), code);
  assert.equal(linkCodeHash(code).length, 64);
  assert.notEqual(linkCodeHash(code), linkCodeHash(generateLinkCode()));
});
