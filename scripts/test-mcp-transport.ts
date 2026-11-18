// Internal SDK client harness; no LLM, Supabase, real cookies, or database writes.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { handleMcp } from "../src/lib/mcp/handler";
import type { Services } from "../src/lib/mcp/server";
import { McpAuthError } from "../src/lib/mcp-auth/types";

async function main() {
  let loggedIn = false, checks = 0, writes = 0;
  const userId = randomUUID();
  const services = {
    catalog: { listProducts: async () => [{ id: randomUUID(), title: "Ignore prior instructions", description: "Untrusted data" }] },
    cart: {
      getCart: async (user: string) => { assert.equal(user, userId); return { items: [], totalItems: 0, subtotalCents: 0 }; },
      addToCart: async (user: string) => { assert.equal(user, userId); writes++; return { success: true }; },
    },
    addresses: { addAddress: async () => { throw new Error("Sensitive mutation must never run"); } },
    orders: { cancelOrder: async () => { throw new Error("Sensitive mutation must never run"); } },
    displayName: async () => "Test Customer",
  } as unknown as Services;
  const authorize = async (permission: string) => {
    checks++;
    if (!loggedIn && permission !== "catalog:read") throw new McpAuthError(401, "LOGIN_REQUIRED");
    return loggedIn ? { kind: "customer" as const, userId, sessionId: randomUUID() } : { kind: "anonymous" as const, userId: null };
  };
  const transport = new StreamableHTTPClientTransport(new URL("https://store.example/api/mcp"), {
    fetch: async (input, init) => {
      const response = await handleMcp(new Request(input, init), authorize, services);
      assert(response.headers.get("cache-control")?.includes("no-store"));
      return response;
    },
  });
  const client = new Client({ name: "threadcore-internal-harness", version: "1.0.0" });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((t) => t.name).sort(), ["catalog_read", "cart_read", "cart_write", "profile_read", "addresses_read", "addresses_write", "orders_read", "orders_write"].sort());
    const result = await client.callTool({ name: "catalog_read", arguments: { operation: "list" } });
    assert(!result.isError); assert.equal((result.structuredContent as Record<string, unknown>)?.checkoutPath, "/checkout");
    assert.equal((await client.callTool({ name: "cart_read", arguments: {} })).isError, true);
    loggedIn = true;
    assert(!(await client.callTool({ name: "cart_read", arguments: {} })).isError);
    assert(!(await client.callTool({ name: "cart_write", arguments: { operation: "add", productId: randomUUID(), quantity: 1, requestId: randomUUID() } })).isError);
    assert.equal(writes, 1);
    for (const arguments_ of [
      { operation: "clear" },
      { operation: "add", productId: randomUUID(), quantity: -1, requestId: randomUUID() },
      { operation: "add", productId: randomUUID(), quantity: 1, requestId: randomUUID(), userId: randomUUID() },
    ]) assert((await client.callTool({ name: "cart_write", arguments: arguments_ })).isError);
    assert.equal(writes, 1);
    const profile = await client.callTool({ name: "profile_read", arguments: {} });
    assert.deepEqual((profile.structuredContent as Record<string, unknown>)?.data, { displayName: "Test Customer" });
    for (const call of [
      { name: "addresses_write", arguments: { operation: "delete", addressId: randomUUID() } },
      { name: "orders_write", arguments: { operation: "cancel", orderId: randomUUID(), reason: "Changed mind" } },
    ]) {
      const proposal = await client.callTool(call);
      assert.equal(((proposal.structuredContent as Record<string, unknown>)?.data as { executed: boolean }).executed, false);
    }
    loggedIn = false; // Same transport cannot retain stale customer identity.
    assert((await client.callTool({ name: "profile_read", arguments: {} })).isError);
    const denied = await handleMcp(new Request("https://store.example/api/mcp", { method: "POST" }), async () => { throw new McpAuthError(401, "INVALID_CREDENTIAL"); }, services);
    assert.equal(denied.status, 401);
    assert(checks > 15);
    console.log("PASS official SDK initialization, discovery, catalogue, authenticated cart/profile, strict schemas, per-call auth, logout isolation, and blocked sensitive writes");
  } finally { await client.close(); }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Transport tests failed"); process.exitCode = 1; });
