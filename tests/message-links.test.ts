import test from "node:test";
import assert from "node:assert/strict";
import { splitMessageLinks } from "../src/lib/message-links";

test("unsupported schemes containing www remain plain text", () => {
  const text = "ftp://www.example.com and www.example.com";
  assert.deepEqual(splitMessageLinks(text), [
    { type: "text", value: "ftp://www.example.com and " },
    { type: "link", value: "www.example.com", href: "https://www.example.com" },
  ]);
});

test("standalone supported URLs remain clickable and preserve surrounding text", () => {
  assert.deepEqual(splitMessageLinks("See https://example.com!"), [
    { type: "text", value: "See " },
    { type: "link", value: "https://example.com", href: "https://example.com" },
    { type: "text", value: "!" },
  ]);
});
