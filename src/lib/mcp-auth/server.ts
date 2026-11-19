import { traceStage } from "@/lib/chat/tracing";
import "server-only";
import { createClient as createAuthClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/config";
import { readBoundaryConfig } from "./config";
import { createAuthenticationBoundary } from "./core";
import { auditStage } from "@/lib/chat/audit";

// No 'use server' directive: these functions must never become public Server Actions.
// Called by the future same-origin chat backend and private MCP route only.
export function privateMcpAuthentication() {
  auditStage("configuration");
  const config = readBoundaryConfig();
  return createAuthenticationBoundary(config, {
    async readAccessToken() {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) throw new Error("Session unavailable");
      // getSession is only the token source; getUser(token) authenticates it below.
      return data.session?.access_token ?? null;
    },
    async verifyUser(token) {
      auditStage("supabase_user");
      // No mutable shared client/session and no service-role key.
      const supabase = createAuthClient(getSupabaseUrl(), getSupabaseAnonKey(), {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data, error } = await traceStage("auth.supabase_get_user", () => supabase.auth.getUser(token));
      if (error) {
        if (error.status && [400, 401, 403, 422].includes(error.status)) return null;
        throw new Error("Authentication unavailable");
      }
      return data.user ? { id: data.user.id, isAnonymous: data.user.is_anonymous === true } : null;
    },
    async sessionIsActive(userId, sessionId) {
      auditStage("session_database");
      return traceStage("db.session_check", () => db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
      const [row] = await tx.execute<{ active: boolean }>(sql`
        select public.threadcore_session_is_active(${userId}::uuid, ${sessionId}::uuid) as active
      `);
      return row?.active === true;
      }));
    },
  });
}
