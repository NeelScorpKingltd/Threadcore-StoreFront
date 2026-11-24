import { propose } from "@/lib/mcp/pending";
import { privateMcpAuthentication } from "@/lib/mcp-auth/server";
import { authenticationErrorResponse } from "@/lib/mcp-auth/http";
import { handleMcp } from "@/lib/mcp/handler";
import * as catalog from "@/services/catalog.service";
import * as cart from "@/services/cart.service";
import * as addresses from "@/services/user.service";
import * as orders from "@/services/order.service";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/config";
import { SESSION_PROOF_HEADER } from "@/lib/mcp-auth/core";
import { enforceChatRateLimit } from "@/lib/chat/rate-limit";
import { ChatHttpError, chatHttpErrorResponse } from "@/lib/chat/http-limits";
import { auditRequest, auditStage } from "@/lib/chat/audit";
import { withChatCapacity } from "@/lib/chat/concurrency";
import { withMcpDeadline } from "@/lib/chat/deadline";
import type { Permission, Principal } from "@/lib/mcp-auth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function handle(request: Request) {
  return auditRequest("mcp", async () => {
    try { return await withMcpDeadline((signal) => withChatCapacity(() => execute(request, signal))); }
    catch (error) { return error instanceof ChatHttpError ? chatHttpErrorResponse(error) : authenticationErrorResponse(error); }
  });
}
async function execute(request: Request, signal: AbortSignal) {
  try {
    auditStage("rate_limit");
    await enforceChatRateLimit("global:mcp", 1800);
    signal.throwIfAborted();
    auditStage("authentication");
    const auth = privateMcpAuthentication();
    const authorizations = new Map<Permission, Promise<Principal>>();
    let limited = false;
    return await handleMcp(request, async (permission) => {
      let verification = authorizations.get(permission);
      if (!verification) {
        verification = auth.authenticateInvocation(request, permission);
        authorizations.set(permission, verification);
      }
      const principal = await verification;
      signal.throwIfAborted();
      if (!limited) {
        await enforceChatRateLimit(`mcp:${principal.userId ?? "anonymous"}`, 180);
        limited = true;
      }
      auditStage("tool");
      return principal;
    }, {
      catalog, cart, addresses, orders, propose,
      async displayName(userId) {
        const client = createClient(getSupabaseUrl(), getSupabaseAnonKey(), { auth: { persistSession: false, autoRefreshToken: false } });
        const { data, error } = await client.auth.getUser(request.headers.get(SESSION_PROOF_HEADER)!);
        if (error || data.user?.id !== userId) throw new Error("Identity unavailable");
        return typeof data.user.user_metadata?.full_name === "string" ? data.user.user_metadata.full_name : "";
      },
    });
  } catch (error) { return error instanceof ChatHttpError ? chatHttpErrorResponse(error) : authenticationErrorResponse(error); }
}
export { handle as POST, handle as GET, handle as DELETE, handle as OPTIONS };

