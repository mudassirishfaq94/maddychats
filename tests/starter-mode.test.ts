import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { guardUploadSize } from "../src/server/http";

test("starter deployment rejects streamed uploads before reading their body", async () => {
  const original = process.env.STARTER_MODE;
  try {
    process.env.STARTER_MODE = "1";
    const request = new NextRequest("https://example.invalid/api/upload/message", {
      method: "POST", body: "not parsed",
    });
    const response = guardUploadSize(request);
    assert.equal(response?.status, 503);
    assert.match((await response!.json()).error, /paused/);
    assert.equal(request.bodyUsed, false);
    process.env.STARTER_MODE = "0";
    assert.equal(guardUploadSize(request), null);
  } finally {
    if (original === undefined) delete process.env.STARTER_MODE;
    else process.env.STARTER_MODE = original;
  }
});
