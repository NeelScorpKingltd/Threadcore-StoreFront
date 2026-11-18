import "server-only";
import { createClient as createAuthClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/config";
import { readBoundaryConfig } from "./config";
import { createAuthenticationBoundary } from "./core";

// No 'use server' directive: these functions must never become public Server Actions.
// Called by the future same-origin chat backend and private MCP route only.
export function privateMcpAuthentication() {
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
      // No mutable shared client/session and no service-role key.
      const supabase = createAuthClient(getSupabaseUrl(), getSupabaseAnonKey(), {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data, error } = await supabase.auth.getUser(token);
      if (error) {
        if (error.status && [400, 401, 403, 422].includes(error.status)) return null;
        throw new Error("Authentication unavailable");
      }
      return data.user ? { id: data.user.id, isAnonymous: data.user.is_anonymous === true } : null;
    },
    async sessionIsActive(userId, sessionId) {
      const [row] = await db.execute<{ active: boolean }>(sql`
        select public.threadcore_session_is_active(${userId}::uuid, ${sessionId}::uuid) as active
      `);
      return row?.active === true;
    },
  });
}
