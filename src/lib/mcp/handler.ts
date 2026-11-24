import "server-only";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticationErrorResponse } from "@/lib/mcp-auth/http";
import { ChatHttpError, chatHttpErrorResponse } from "@/lib/chat/http-limits";
import type { Authorize, Services } from "./server";
import { createMcpServer } from "./server";

export async function handleMcp(request: Request, authorize: Authorize, services: Services): Promise<Response> {
  try {
    await authorize("catalog:read"); // discovery/initialize are private too
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } });
    // Fixed deployment origin is already checked by the authentication boundary.
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403 });
    const server = createMcpServer(authorize, services);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 64 * 1024 });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(request);
      // JSON-only transport completes the RPC before returning; no SSE is left open.
      const body = await response.arrayBuffer();
      const headers = new Headers(response.headers);
      headers.set("cache-control", "no-store, private"); headers.set("vary", "Cookie, Authorization");
      return new Response(body.byteLength ? body : null, { status: response.status, headers });
    } finally { await server.close(); }
  } catch (error) { return error instanceof ChatHttpError ? chatHttpErrorResponse(error) : authenticationErrorResponse(error); }
}
