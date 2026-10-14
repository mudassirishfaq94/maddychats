import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const braces = createRequire(import.meta.url)("braces");
test("normal brace compilation and expansion retain their results", () => {
  assert.deepEqual(braces.expand("src/{app,components}/**/*.{ts,tsx}"), ["src/app/**/*.ts", "src/app/**/*.tsx", "src/components/**/*.ts", "src/components/**/*.tsx"]);
  assert.equal(braces.compile("a/{b,c}/d"), "a/(b|c)/d");
});
test("deeply nested patterns fail with a controlled depth error in every recursive walker", () => {
  const input = "{".repeat(2000) + "a,b" + "}".repeat(2000);
  for (const operation of ["compile", "expand", "stringify"]) assert.throws(() => braces[operation](input), /security depth limit/, operation);
});
