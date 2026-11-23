import { privateMcpAuthentication } from "@/lib/mcp-auth/server";
import { auditConfirmation, auditRequest, auditStage } from "@/lib/chat/audit";
import { withMcpDeadline } from "@/lib/chat/deadline";
import { withChatCapacity } from "@/lib/chat/concurrency";
import { authenticationErrorResponse } from "@/lib/mcp-auth/http";
import { decide, listPending } from "@/lib/mcp/pending";
import { confirmationBody } from "@/lib/mcp/confirmation-schema";
import { DomainError, StaleProposalError } from "@/lib/domain/errors";
import { enforceChatRateLimit } from "@/lib/chat/rate-limit";
import { ChatHttpError, chatHttpErrorResponse, limitedJsonResponse, readLimitedJson } from "@/lib/chat/http-limits";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return auditRequest("confirm", () => handle(request));
}
async function handle(request: Request) {
  try { return await withMcpDeadline((signal) => withChatCapacity(() => execute(request, signal))); }
  catch (error) { return error instanceof ChatHttpError ? chatHttpErrorResponse(error) : authenticationErrorResponse(error); }
}
async function execute(request: Request, signal: AbortSignal) {
  const headers = { "cache-control": "no-store, private" };
  try {
    auditStage("rate_limit");
    await enforceChatRateLimit("global:confirm", 300);
    auditStage("authentication");
    const user = await privateMcpAuthentication().requireBrowserCustomer(request);
    auditStage("rate_limit");
    await enforceChatRateLimit(`confirm:${user.userId}`, 30);
    auditStage("input");
    const body = await readLimitedJson(request, 4096);
    const parsed = confirmationBody.safeParse(body);
    if (!parsed.success) return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
    auditStage("confirmation");
    signal.throwIfAborted();
    if ("operation" in parsed.data) return limitedJsonResponse({ actions: await listPending(user.userId) });
    const result = await decide(user.userId, parsed.data.id, parsed.data.confirm);
    auditConfirmation(parsed.data.confirm, result.status);
    return limitedJsonResponse(result);
  } catch (error) {
    if (error instanceof ChatHttpError) return chatHttpErrorResponse(error);
    if (error instanceof StaleProposalError) return Response.json({ error: { code: "STALE_PROPOSAL" } }, { status: 409, headers });
    if (error instanceof DomainError) return Response.json({ error: error.message }, { status: 409, headers });
    return authenticationErrorResponse(error);
  }
}
