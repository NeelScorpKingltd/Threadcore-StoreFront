import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { privateMcpAuthentication } from "@/lib/mcp-auth/server";
import { readBoundaryConfig } from "@/lib/mcp-auth/config";
import { enforceChatRateLimit } from "./rate-limit";

export const TOOL_NAMES = ["catalog_read", "cart_read", "cart_write", "profile_read", "addresses_read", "addresses_write", "orders_read", "orders_write"] as const;
export type ToolName = typeof TOOL_NAMES[number];
type DataRecord = Record<string, unknown>;

function isRecord(value: unknown): value is DataRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function projectCartReadForModel(result: DataRecord) {
  if (result.isError === true) return { status: "failed" };
  const envelope = isRecord(result.structuredContent) ? result.structuredContent : null;
  const data = envelope && isRecord(envelope.data) ? envelope.data : null;
  if (!data) return { status: "unavailable" };

  const items = Array.isArray(data.items) ? data.items.flatMap((value) => {
    if (!isRecord(value)) return [];
    const product = isRecord(value.product) ? value.product : {};
    return [{
      ...(typeof value.id === "string" ? { cartItemId: value.id } : {}),
      ...(typeof value.productId === "string" ? { productId: value.productId } : {}),
      ...(typeof value.quantity === "number" ? { quantity: value.quantity } : {}),
      product: {
        ...(typeof product.title === "string" ? { title: product.title } : {}),
        ...(typeof product.sku === "string" ? { sku: product.sku } : {}),
        ...(typeof product.priceCents === "number" ? { priceCents: product.priceCents } : {}),
      },
    }];
  }) : [];

  return {
    status: "ok",
    cart: {
      items,
      ...(typeof data.subtotalCents === "number" ? { subtotalCents: data.subtotalCents } : {}),
      ...(typeof data.totalItems === "number" ? { totalItems: data.totalItems } : {}),
    },
  };
}

// Fresh client and delegation for each browser request. Never share across accounts.
export async function withChatTools<T>(request: Request, work: (client: Client) => Promise<T>): Promise<T> {
  const authentication = privateMcpAuthentication();
  const config = readBoundaryConfig();
  // Establish the current browser context before any transport is opened.
  const initialDelegation = await authentication.delegateFromBrowser(request);
  await enforceChatRateLimit(`tools:${initialDelegation.rateLimitSubject()}`, 60);
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
      // Vercel Preview deployments may require Protection Bypass for Automation
      // for this same-origin server-to-server call. The secret is server-only and
      // is attached only in Preview to the already-validated fixed MCP endpoint.
      const bypassSecret = process.env.VERCEL_ENV === "preview"
        ? process.env.VERCEL_AUTOMATION_BYPASS_SECRET
        : undefined;
      if (bypassSecret) secured.headers.set("x-vercel-protection-bypass", bypassSecret);
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
    modelResult: privateData ? { status: result.isError ? "failed" : "shown_in_private_ui" }
      : tool === "cart_read" ? projectCartReadForModel(result) : result,
    persist: false,
    checkoutPath: "/checkout",
    loginPath: "/login",
    refreshConfirmations: tool === "addresses_write" || tool === "orders_write",
  };
}
