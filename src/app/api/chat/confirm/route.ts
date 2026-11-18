import { privateMcpAuthentication } from "@/lib/mcp-auth/server";
import { authenticationErrorResponse } from "@/lib/mcp-auth/http";
import { decide, listPending } from "@/lib/mcp/pending";
import { confirmationBody } from "@/lib/mcp/confirmation-schema";
import { DomainError } from "@/lib/domain/errors";
import { enforceChatRateLimit } from "@/lib/chat/rate-limit";
import { ChatHttpError, chatHttpErrorResponse, limitedJsonResponse, readLimitedJson } from "@/lib/chat/http-limits";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const headers = { "cache-control": "no-store, private" };
  try {
    await enforceChatRateLimit("global:confirm", 300);
    const user = await privateMcpAuthentication().requireBrowserCustomer(request);
    await enforceChatRateLimit(`confirm:${user.userId}`, 30);
    const body = await readLimitedJson(request, 4096);
    const parsed = confirmationBody.safeParse(body);
    if (!parsed.success) return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
    return limitedJsonResponse("operation" in parsed.data ? { actions: await listPending(user.userId) }
      : await decide(user.userId, parsed.data.id, parsed.data.confirm));
  } catch (error) {
    if (error instanceof ChatHttpError) return chatHttpErrorResponse(error);
    if (error instanceof DomainError) return Response.json({ error: error.message }, { status: 409, headers });
    return authenticationErrorResponse(error);
  }
}
