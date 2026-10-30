import assert from "node:assert/strict";
import { test } from "node:test";
import { invalidateChatRouteData, prefetchChatRouteData, retainChatRouteAccount } from "../src/lib/chat-route-prefetch";

const conversationId = "10000000-0000-4000-8000-000000000001";

test("a changed conversation invalidates only its account's prefetched policy", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let calls=0;
  globalThis.fetch=(async()=>{calls++;return fixtureResponse(200,"policy-account");}) as typeof fetch;
  await prefetchChatRouteData("policy-account",conversationId);
  invalidateChatRouteData("other-account",conversationId);
  await prefetchChatRouteData("policy-account",conversationId);
  assert.equal(calls,1);
  invalidateChatRouteData("policy-account",conversationId);
  await prefetchChatRouteData("policy-account",conversationId);
  assert.equal(calls,2,"A changed timer must fetch fresh authorized details even within the prefetch TTL");
});

function fixtureResponse(status = 200, viewerId = "account-a") {
  const body = {
    viewerId,
    conversation: { id: conversationId, members: [] },
    initial: { messages: [], nextCursor: null, hasMore: false },
  };
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("chat route prefetch shares pending authorized reads within one account", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const requests: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requests.push(String(input));
    await new Promise((resolve) => setTimeout(resolve, 5));
    return fixtureResponse();
  }) as typeof fetch;

  const [first, second] = await Promise.all([
    prefetchChatRouteData("account-a", conversationId),
    prefetchChatRouteData("account-a", conversationId),
  ]);

  assert.equal(first, second);
  assert.equal(requests.length, 1);
  assert(requests[0].endsWith(`/api/conversations/${conversationId}/open`));
});

test("chat route prefetch is isolated by account and discarded on account switch", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let requests = 0;
  globalThis.fetch = (async (_input: RequestInfo | URL) => {
    requests++;
    return fixtureResponse(200, requests === 2 ? "account-c" : "account-b");
  }) as typeof fetch;

  await prefetchChatRouteData("account-b", conversationId);
  await prefetchChatRouteData("account-c", conversationId);
  assert.equal(requests, 2);
  retainChatRouteAccount("account-c");
  await prefetchChatRouteData("account-b", conversationId);
  assert.equal(requests, 3, "old account data is not retained after identity changes");
});

test("failed authorization responses are never retained as chat data", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let requests = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requests++;
    return fixtureResponse(requests === 1 ? 404 : 200, "account-d");
  }) as typeof fetch;

  await assert.rejects(prefetchChatRouteData("account-d", conversationId));
  await prefetchChatRouteData("account-d", conversationId);
  assert.equal(requests, 2, "a later request retries the member-authorized API read");
});

test("only a transport failure may fall back to recent authorized data", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  t.after(() => { globalThis.fetch = originalFetch; Date.now = originalNow; });
  let fail = false;
  globalThis.fetch = (async () => {
    if (fail) throw new TypeError("Failed to fetch");
    return fixtureResponse(200, "account-offline");
  }) as typeof fetch;
  const authorized = await prefetchChatRouteData("account-offline", conversationId);
  Date.now = () => originalNow() + 16_000;
  fail = true;
  const fallback = await prefetchChatRouteData("account-offline", conversationId);
  assert.equal(fallback, authorized);
});

test("chat response from a switched server session is rejected even for a shared chat", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = (async () => fixtureResponse(200, "different-account")) as typeof fetch;
  await assert.rejects(prefetchChatRouteData("expected-account", conversationId), /account changed/);
});
