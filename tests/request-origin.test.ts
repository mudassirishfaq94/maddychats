import { test } from "node:test";
import assert from "node:assert/strict";
import { originAllowed } from "../src/lib/request-origin";

test("Origin guards reject protocol, port, suffix and opaque-origin tricks", () => {
  const configured = "https://circlo.chat";
  const request = "https://maddychats.onrender.com";
  for (const value of ["https://circlo.chat", "https://maddychats.onrender.com"]) assert(originAllowed(value, configured, request));
  for (const value of ["http://circlo.chat", "https://circlo.chat:8443", "https://circlo.chat.evil.example",
    "https://evil.example", "null", "https://user@circlo.chat", "https://circlo.chat/path",
    "https://circlo.chat?x=1", "https://circlo.chat#x", "javascript:alert(1)"]) {
    assert.equal(originAllowed(value, configured, request), false, value);
  }
  assert(originAllowed("http://127.0.0.1:3000", "http://127.0.0.1:3000", "http://127.0.0.1:3000"));
});
