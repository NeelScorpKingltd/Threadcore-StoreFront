import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { privateMcpAuthentication } from "@/lib/mcp-auth/server";
import { readBoundaryConfig } from "@/lib/mcp-auth/config";

export const TOOL_NAMES = ["catalog_read", "cart_read", "cart_write", "profile_read", "addresses_read", "addresses_write", "orders_read", "orders_write"] as const;
export type ToolName = typeof TOOL_NAMES[number];

// Fresh client and delegation for each browser request. Never share across accounts.
export async function withChatTools<T>(request: Request, work: (client: Client) => Promise<T>): Promise<T> {
  const authentication = privateMcpAuthentication();
  const config = readBoundaryConfig();
  // Establish the current browser context before any transport is opened.
  await authentication.delegateFromBrowser(request);
  const client = new Client({ name: "threadcore-chat-backend", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${config.origin}/api/mcp`), {
    fetch: async (input, init) => {
      const outbound = new Request(input, init);
      if (outbound.url !== `${config.origin}/api/mcp`) throw new Error("Unexpected transport target");
      if (outbound.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
      const delegation = await authentication.delegateFromBrowser(request);
      // SDK initialization and every call get fresh hidden credentials. Never forward
      // browser headers wholesale, allow redirects, or place credentials in tool args.
      const secured = delegation.transportRequest(await outbound.text());
      const protocol = outbound.headers.get("mcp-protocol-version");
      if (protocol) secured.headers.set("mcp-protocol-version", protocol);
      return fetch(secured);
    },
  });
  try { await client.connect(transport); return await work(client); }
  finally { await client.close(); }
}

export function presentToolResult(tool: ToolName, result: Record<string, unknown>) {
  const serialized = JSON.stringify(result);
  const loginRequired = serialized.includes('"LOGIN_REQUIRED"') || serialized.includes('"INVALID_CREDENTIAL"');
  const privateData = tool.startsWith("addresses_") || tool.startsWith("orders_");
  return {
    kind: loginRequired ? "login_required" : result.isError ? "error" : "tool_result",
    tool,
    uiResult: result,
    // The future model gets no address/order bodies by default. UI rendering is
    // separate from conversation storage; this adapter writes no logs/history.
    modelResult: privateData ? { status: result.isError ? "failed" : "shown_in_private_ui" } : result,
    persist: false,
    checkoutPath: "/checkout",
    loginPath: "/login",
    refreshConfirmations: tool === "addresses_write" || tool === "orders_write",
  };
}
