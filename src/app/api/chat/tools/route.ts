import { z } from "zod";
import { TOOL_NAMES, presentToolResult, withChatTools } from "@/lib/chat/adapter";
import { authenticationErrorResponse } from "@/lib/mcp-auth/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("list") }).strict(),
  z.object({ operation: z.literal("call"), tool: z.enum(TOOL_NAMES), arguments: z.record(z.string(), z.unknown()) }).strict(),
]);
export async function POST(request: Request) {
  try {
    // Authenticate/origin-check even malformed browser input before handling it.
    return await withChatTools(request, async (client) => {
      const parsed = schema.safeParse(await request.json());
      if (!parsed.success) return Response.json({ kind: "error", code: "INVALID_REQUEST" }, { status: 400, headers: { "cache-control": "no-store" } });
      const body = parsed.data;
      const result = body.operation === "list" ? { kind: "tools", tools: (await client.listTools()).tools, persist: false }
        : presentToolResult(body.tool, await client.callTool({ name: body.tool, arguments: body.arguments }));
      return Response.json(result, { headers: { "cache-control": "no-store, private", vary: "Cookie" } });
    });
  } catch (error) { return authenticationErrorResponse(error); }
}
