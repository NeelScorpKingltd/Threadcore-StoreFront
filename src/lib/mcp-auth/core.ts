import "server-only";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { decodeJwt, jwtVerify, SignJWT } from "jose";
import { customerId, uuid } from "@/lib/domain/validation";
import { assertTrustedBrowserMutation } from "./browser";
import { DELEGATION_TTL_SECONDS, DELEGATION_TYPE, type BoundaryConfig } from "./config";
import { CUSTOMER_PERMISSIONS, McpAuthError, type Permission, type Principal } from "./types";

export const SESSION_PROOF_HEADER = "x-threadcore-customer-session";
type Dependencies = {
  readAccessToken: () => Promise<string | null>;
  // Production implementation must use Supabase getUser(token), never decoded claims alone.
  verifyUser: (accessToken: string) => Promise<{ id: string; isAnonymous?: boolean } | null>;
  sessionIsActive: (userId: string, sessionId: string) => Promise<boolean>;
  now?: () => number;
};
type Identity = { userId: string; sessionId: string; expiresAt: number; token: string };
const tokenPattern = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/;
const digest = (value: string) => createHash("sha256").update(value).digest("base64url");

// Private fields prevent accidental credential serialization into a tool result/log.
export class InternalDelegation {
  #headers: Headers;
  #endpoint: string;
  constructor(token: string, origin: string, sessionToken?: string) {
    this.#endpoint = `${origin}/api/mcp`;
    this.#headers = new Headers({ authorization: `Bearer ${token}` });
    if (sessionToken) this.#headers.set(SESSION_PROOF_HEADER, sessionToken);
  }
  transportHeaders(): Headers { return new Headers(this.#headers); }
  transportRequest(body: string): Request {
    const headers = this.transportHeaders();
    headers.set("content-type", "application/json");
    headers.set("accept", "application/json, text/event-stream");
    // Do not forward a session proof to an arbitrary URL or follow a redirect.
    return new Request(this.#endpoint, { method: "POST", headers, body, redirect: "error", cache: "no-store" });
  }
  toJSON() { return { redacted: true }; }
}

export function createAuthenticationBoundary(config: BoundaryConfig, deps: Dependencies) {
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));

  async function verifyIdentity(token: string): Promise<Identity> {
    if (token.length > 8192 || !tokenPattern.test(token)) throw new McpAuthError(401, "INVALID_CREDENTIAL");
    let user: { id: string; isAnonymous?: boolean } | null;
    try { user = await deps.verifyUser(token); }
    catch { throw new McpAuthError(503, "AUTH_UNAVAILABLE"); }
    if (!user) throw new McpAuthError(401, "INVALID_CREDENTIAL");
    if (user.isAnonymous === true) throw new McpAuthError(401, "LOGIN_REQUIRED");
    let identity: Identity;
    try {
      // Only inspect claims AFTER Supabase has authenticated this exact token.
      const claims = decodeJwt(token);
      const userId = customerId(user.id);
      if (claims.sub !== userId || claims.iss !== config.supabaseIssuer || claims.aud !== "authenticated" ||
          !Number.isInteger(claims.exp) || claims.exp! <= now()) throw new Error();
      identity = { userId, sessionId: uuid(claims.session_id, "session ID"), expiresAt: claims.exp!, token };
    } catch { throw new McpAuthError(401, "INVALID_CREDENTIAL"); }
    let active: boolean;
    try { active = await deps.sessionIsActive(identity.userId, identity.sessionId); }
    catch { throw new McpAuthError(503, "AUTH_UNAVAILABLE"); }
    if (!active || identity.expiresAt <= now()) throw new McpAuthError(401, "INVALID_CREDENTIAL");
    return identity;
  }

  async function currentIdentity() {
    let token: string | null;
    try { token = await deps.readAccessToken(); }
    catch { throw new McpAuthError(401, "INVALID_CREDENTIAL"); }
    return token === null ? null : verifyIdentity(token);
  }

  async function requireBrowserCustomer(request: Request): Promise<Extract<Principal, { kind: "customer" }>> {
    assertTrustedBrowserMutation(request, config.origin);
    const identity = await currentIdentity();
    if (!identity) throw new McpAuthError(401, "LOGIN_REQUIRED");
    return Object.freeze({ kind: "customer", userId: identity.userId, sessionId: identity.sessionId });
  }

  async function delegateFromBrowser(request: Request): Promise<InternalDelegation> {
    assertTrustedBrowserMutation(request, config.origin);
    const identity = await currentIdentity();
    const issuedAt = now();
    const expiresAt = Math.min(issuedAt + DELEGATION_TTL_SECONDS, identity?.expiresAt ?? Infinity);
    if (expiresAt <= issuedAt) throw new McpAuthError(401, "INVALID_CREDENTIAL");
    const claims = identity ? {
      kind: "customer", permissions: [...CUSTOMER_PERMISSIONS], sid: identity.sessionId, session_hash: digest(identity.token),
    } : { kind: "anonymous", permissions: ["catalog:read"] };
    const token = await new SignJWT(claims).setProtectedHeader({ alg: "HS256", typ: DELEGATION_TYPE, kid: config.activeKid })
      .setIssuer(config.issuer).setAudience(config.audience).setSubject(identity?.userId ?? "anonymous")
      .setJti(randomUUID()).setIssuedAt(issuedAt).setNotBefore(issuedAt).setExpirationTime(expiresAt)
      .sign(config.keys.get(config.activeKid)!);
    return new InternalDelegation(token, config.origin, identity?.token);
  }

  async function authenticateInvocation(request: Request, permission: Permission): Promise<Principal> {
    if (new URL(request.url).origin !== config.origin) throw new McpAuthError(401, "INVALID_CREDENTIAL");
    if (!CUSTOMER_PERMISSIONS.includes(permission)) throw new McpAuthError(403, "FORBIDDEN");
    const bearer = request.headers.get("authorization")?.match(/^Bearer ([a-zA-Z0-9_.-]+)$/)?.[1];
    if (!bearer || bearer.length > 4096 || !tokenPattern.test(bearer)) throw new McpAuthError(401, "INVALID_CREDENTIAL");
    let payload;
    try {
      const verified = await jwtVerify(bearer, (header) => {
        if (header.alg !== "HS256" || typeof header.kid !== "string" || !config.keys.has(header.kid)) throw new Error();
        return config.keys.get(header.kid)!;
      }, { algorithms: ["HS256"], typ: DELEGATION_TYPE, issuer: config.issuer, audience: config.audience,
        requiredClaims: ["sub", "jti", "iat", "nbf", "exp", "kind", "permissions"],
        maxTokenAge: DELEGATION_TTL_SECONDS, clockTolerance: 0, currentDate: new Date(now() * 1000) });
      payload = verified.payload;
      if (payload.aud !== config.audience || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) ||
          payload.exp! <= payload.iat! || payload.exp! - payload.iat! > DELEGATION_TTL_SECONDS || payload.iat! > now()) throw new Error();
      uuid(payload.jti, "request ID");
      if (!Array.isArray(payload.permissions) || payload.permissions.length < 1 || payload.permissions.length > CUSTOMER_PERMISSIONS.length ||
          new Set(payload.permissions).size !== payload.permissions.length ||
          payload.permissions.some((p) => !CUSTOMER_PERMISSIONS.includes(p))) throw new Error();
    } catch { throw new McpAuthError(401, "INVALID_CREDENTIAL"); }

    if (payload.kind === "anonymous") {
      if (payload.sub !== "anonymous" || payload.sid !== undefined || payload.session_hash !== undefined ||
          payload.permissions.length !== 1 || payload.permissions[0] !== "catalog:read" || request.headers.has(SESSION_PROOF_HEADER)) {
        throw new McpAuthError(401, "INVALID_CREDENTIAL");
      }
      if (permission !== "catalog:read") throw new McpAuthError(401, "LOGIN_REQUIRED");
      return Object.freeze({ kind: "anonymous", userId: null });
    }
    if (payload.kind !== "customer") throw new McpAuthError(401, "INVALID_CREDENTIAL");
    if (!payload.permissions.includes(permission)) throw new McpAuthError(403, "FORBIDDEN");
    const sessionToken = request.headers.get(SESSION_PROOF_HEADER);
    if (!sessionToken) throw new McpAuthError(401, "LOGIN_REQUIRED");
    const identity = await verifyIdentity(sessionToken);
    if (payload.exp! <= now()) throw new McpAuthError(401, "INVALID_CREDENTIAL");
    const expected = Buffer.from(digest(identity.token));
    const actual = typeof payload.session_hash === "string" ? Buffer.from(payload.session_hash) : Buffer.alloc(0);
    if (payload.sub !== identity.userId || payload.sid !== identity.sessionId || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new McpAuthError(401, "INVALID_CREDENTIAL");
    }
    return Object.freeze({ kind: "customer", userId: identity.userId, sessionId: identity.sessionId });
  }

  return Object.freeze({ delegateFromBrowser, authenticateInvocation, requireBrowserCustomer });
}
