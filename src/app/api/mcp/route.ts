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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function handle(request: Request) {
  try {
    const auth = privateMcpAuthentication();
    return await handleMcp(request, (permission) => auth.authenticateInvocation(request, permission), {
      catalog, cart, addresses, orders, propose,
      async displayName(userId) {
        const client = createClient(getSupabaseUrl(), getSupabaseAnonKey(), { auth: { persistSession: false, autoRefreshToken: false } });
        const { data, error } = await client.auth.getUser(request.headers.get(SESSION_PROOF_HEADER)!);
        if (error || data.user?.id !== userId) throw new Error("Identity unavailable");
        return typeof data.user.user_metadata?.full_name === "string" ? data.user.user_metadata.full_name : "";
      },
    });
  } catch (error) { return authenticationErrorResponse(error); }
}
export { handle as POST, handle as GET, handle as DELETE, handle as OPTIONS };

