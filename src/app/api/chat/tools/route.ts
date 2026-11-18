import { z } from "zod";
import { TOOL_NAMES, presentToolResult, withChatTools } from "@/lib/chat/adapter";
import { authenticationErrorResponse } from "@/lib/mcp-auth/http";
import { enforceChatRateLimit } from "@/lib/chat/rate-limit";
import { ChatHttpError, chatHttpErrorResponse, limitedJsonResponse, readLimitedJson } from "@/lib/chat/http-limits";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("list") }).strict(),
  z.object({ operation: z.literal("call"), tool: z.enum(TOOL_NAMES), arguments: z.record(z.string(), z.unknown()) }).strict(),
]);
export async function POST(request: Request) {
  try {
    await enforceChatRateLimit("global:tools", 600);
    // Authenticate/origin-check even malformed browser input before handling it.
    return await withChatTools(request, async (client) => {
      const parsed = schema.safeParse(await readLimitedJson(request, 32 * 1024));
      if (!parsed.success) return Response.json({ kind: "error", code: "INVALID_REQUEST" }, { status: 400, headers: { "cache-control": "no-store" } });
      const body = parsed.data;
      const result = body.operation === "list" ? { kind: "tools", tools: (await client.listTools()).tools, persist: false }
        : presentToolResult(body.tool, await client.callTool({ name: body.tool, arguments: body.arguments }));
      return limitedJsonResponse(result);
    });
  } catch (error) { return error instanceof ChatHttpError ? chatHttpErrorResponse(error) : authenticationErrorResponse(error); }
}
