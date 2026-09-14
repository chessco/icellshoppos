import test from "node:test";
import assert from "node:assert/strict";
import { ProBuyerApiClient } from "../src/index.js";
import { BearerAuthToken } from "@ireader/contracts";

test("ProBuyerApiClient attaches token headers to requests", async () => {
  let capturedHeaders: Record<string, string> = {};

  // Mock global fetch
  const originalFetch = global.fetch;
  global.fetch = async (input: any, init?: any) => {
    const headers = new Headers(init?.headers);
    capturedHeaders = Object.fromEntries(headers.entries());
    return new Response(JSON.stringify({ ok: true, inventoryItems: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const token = new BearerAuthToken("test-jwt-secret-xyz");
    const client = new ProBuyerApiClient({
      baseUrl: "https://mock.icellshop.com",
      getToken: () => token,
    });

    const res = await client.getInventoryList("Available");
    assert.equal(res.ok, true);
    assert.equal(capturedHeaders["authorization"], "Bearer test-jwt-secret-xyz");
  } finally {
    global.fetch = originalFetch;
  }
});

test("ProBuyerApiClient handles network failures without unhandled throws", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error("Connection refused");
  };

  try {
    const client = new ProBuyerApiClient({
      baseUrl: "https://offline.icellshop.com",
    });

    const res = await client.getInventoryList();
    assert.equal(res.ok, false);
    assert.ok(res.error?.includes("Connection refused"));
  } finally {
    global.fetch = originalFetch;
  }
});
