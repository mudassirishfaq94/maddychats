import assert from "node:assert/strict";
import { test } from "node:test";
import { prefetchChatRouteData, retainChatRouteAccount } from "../src/lib/chat-route-prefetch";

const conversationId = "10000000-0000-4000-8000-000000000001";

function fixtureResponse(status = 200) {
  const body = {
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
    return fixtureResponse();
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
    return fixtureResponse(requests === 1 ? 404 : 200);
  }) as typeof fetch;

  await assert.rejects(prefetchChatRouteData("account-d", conversationId));
  await prefetchChatRouteData("account-d", conversationId);
  assert.equal(requests, 2, "a later request retries the member-authorized API read");
});
