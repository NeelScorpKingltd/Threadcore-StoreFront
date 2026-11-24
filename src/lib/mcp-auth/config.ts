import "server-only";
import { McpAuthError } from "./types";

export const DELEGATION_TTL_SECONDS = 30;
export const DELEGATION_TYPE = "threadcore-mcp+jwt";
export type BoundaryConfig = Readonly<{
  origin: string; issuer: string; audience: string; supabaseIssuer: string;
  activeKid: string; keys: ReadonlyMap<string, Uint8Array>;
}>;

export function readBoundaryConfig(env: NodeJS.ProcessEnv = process.env): BoundaryConfig {
  try {
    const origin = env.THREADCORE_APP_ORIGIN!;
    const url = new URL(origin);
    const local = env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.origin !== origin || (url.protocol !== "https:" && !(local && url.protocol === "http:"))) throw new Error();
    const issuer = env.THREADCORE_MCP_ISSUER!;
    const audience = env.THREADCORE_MCP_AUDIENCE!;
    if (![issuer, audience].every((s) => typeof s === "string" && /^(urn:|https:\/\/)[^\s]{5,200}$/.test(s))) throw new Error();
    const supabase = new URL(env.NEXT_PUBLIC_SUPABASE_URL!);
    if (supabase.protocol !== "https:" && !(local && ["localhost", "127.0.0.1"].includes(supabase.hostname))) throw new Error();
    if (supabase.username || supabase.password || supabase.search || supabase.hash || supabase.pathname !== "/") throw new Error();
    const raw: unknown = JSON.parse(env.THREADCORE_MCP_SIGNING_KEYS!);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error();
    const entries = Object.entries(raw);
    if (entries.length < 1 || entries.length > 3) throw new Error();
    const keys = new Map<string, Uint8Array>();
    for (const [kid, value] of entries) {
      if (!/^[a-zA-Z0-9_-]{1,32}$/.test(kid) || typeof value !== "string" || !/^[a-zA-Z0-9_-]{43}$/.test(value)) throw new Error();
      const key = Buffer.from(value, "base64url");
      if (key.length !== 32 || key.toString("base64url") !== value) throw new Error();
      keys.set(kid, key);
    }
    const activeKid = env.THREADCORE_MCP_SIGNING_KID!;
    if (!keys.has(activeKid)) throw new Error();
    return Object.freeze({ origin, issuer, audience, supabaseIssuer: `${supabase.origin}/auth/v1`, activeKid, keys });
  } catch {
    // Never include environment values, token contents or key material in an error.
    throw new McpAuthError(503, "AUTH_UNAVAILABLE");
  }
}
