import { test } from "node:test";
import assert from "node:assert/strict";
import { browserLabel, countryFlag, countryName, platformLabel } from "../src/server/device-meta";

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
