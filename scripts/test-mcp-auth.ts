// No .env loading, database connection, live Supabase call or persisted key.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify, decodeJwt, type JWTPayload } from "jose";
import { readBoundaryConfig, DELEGATION_TYPE } from "../src/lib/mcp-auth/config";
import { createAuthenticationBoundary, SESSION_PROOF_HEADER, InternalDelegation } from "../src/lib/mcp-auth/core";
import { CUSTOMER_PERMISSIONS, McpAuthError, type Permission } from "../src/lib/mcp-auth/types";
import { authenticationErrorResponse } from "../src/lib/mcp-auth/http";
import { assertTrustedBrowserMutation } from "../src/lib/mcp-auth/browser";
import { isIntegrationApiPath } from "../src/lib/mcp-auth/paths";
import { getSafeRedirectPath } from "../src/lib/supabase/redirect";
import { getSupabaseUrl, getSupabaseAnonKey } from "../src/lib/supabase/config";

async function main() {
  const key = randomBytes(32), otherKey = randomBytes(32), supabaseKey = randomBytes(32);
  const env = {
    NODE_ENV: "test", THREADCORE_APP_ORIGIN: "https://store.example",
    THREADCORE_MCP_ISSUER: "urn:threadcore:test:backend", THREADCORE_MCP_AUDIENCE: "urn:threadcore:test:mcp",
    NEXT_PUBLIC_SUPABASE_URL: "https://auth.example", THREADCORE_MCP_SIGNING_KID: "current",
    THREADCORE_MCP_SIGNING_KEYS: JSON.stringify({ current: key.toString("base64url") }),
  } satisfies NodeJS.ProcessEnv;
  const config = readBoundaryConfig(env);
  let time = 2_000_000_000;
  let currentToken: string | null = null;
  let tokenReadFailure = false, supabaseFailure = false, databaseFailure = false, anonymousAuthUser = false;
  let calls = 0, sessionCalls = 0, passed = 0, simulateAuthDelay = 0;
  const active = new Set<string>();
  const userA = randomUUID(), userB = randomUUID(), sessionA = randomUUID(), sessionB = randomUUID();
  const browser = (headers: HeadersInit = {}, method = "POST", url = `${config.origin}/api/chat/tool`) =>
    new Request(url, { method, headers: { origin: config.origin, "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers } });
  const mcp = (delegation: InternalDelegation) => new Request(`${config.origin}/api/mcp`, { method: "POST", headers: delegation.transportHeaders() });
  const boundary = createAuthenticationBoundary(config, {
    now: () => time,
    readAccessToken: async () => { if (tokenReadFailure) throw new Error("private cookie details"); return currentToken; },
    verifyUser: async (token) => {
      calls++;
      if (supabaseFailure) throw new Error("private auth failure");
      try {
        const { payload } = await jwtVerify(token, supabaseKey, { issuer: config.supabaseIssuer, audience: "authenticated", currentDate: new Date(time * 1000) });
        time += simulateAuthDelay;
        return payload.sub ? { id: payload.sub, isAnonymous: anonymousAuthUser } : null;
      } catch { return null; }
    },
    sessionIsActive: async (user, session) => {
      sessionCalls++;
      if (databaseFailure) throw new Error("private database details");
      return active.has(`${user}:${session}`);
    },
  });
  const accessToken = (user = userA, session = sessionA, expiresAt = time + 300) => new SignJWT({ session_id: session })
    .setProtectedHeader({ alg: "HS256" }).setIssuer(config.supabaseIssuer).setAudience("authenticated")
    .setSubject(user).setIssuedAt(time).setExpirationTime(expiresAt).setJti(randomUUID()).sign(supabaseKey);
  const sign = (claims: JWTPayload, options: { kid?: string; alg?: string; typ?: string; key?: Uint8Array } = {}) =>
    new SignJWT(claims).setProtectedHeader({ alg: options.alg ?? "HS256", typ: options.typ ?? DELEGATION_TYPE, kid: options.kid ?? "current" }).sign(options.key ?? key);
  const reject = async (work: () => unknown | Promise<unknown>, status = 401) => {
    await assert.rejects(async () => work(), (error: unknown) => error instanceof McpAuthError && error.status === status);
  };
  const check = async (name: string, work: () => void | Promise<void>) => { await work(); passed++; console.log(`PASS ${name}`); };
  active.add(`${userA}:${sessionA}`); active.add(`${userB}:${sessionB}`);

  await check("anonymous access is catalog-only and never contains customer identity", async () => {
    const delegation = await boundary.delegateFromBrowser(browser());
    assert.deepEqual(await boundary.authenticateInvocation(mcp(delegation), "catalog:read"), { kind: "anonymous", userId: null });
    for (const permission of CUSTOMER_PERMISSIONS.filter((p) => p !== "catalog:read")) await reject(() => boundary.authenticateInvocation(mcp(delegation), permission));
    assert.equal(calls, 0); assert.equal(sessionCalls, 0);
    await reject(() => boundary.requireBrowserCustomer(browser()));
  });
  let delegation: InternalDelegation;
  await check("verified customer identity and permissions come from the session, with per-call revalidation", async () => {
    currentToken = await accessToken();
    delegation = await boundary.delegateFromBrowser(browser());
    const before = calls, sessionBefore = sessionCalls;
    for (const permission of CUSTOMER_PERMISSIONS) {
      const principal = await boundary.authenticateInvocation(mcp(delegation), permission);
      assert.deepEqual(principal, { kind: "customer", userId: userA, sessionId: sessionA });
      assert(Object.isFrozen(principal));
    }
    assert.equal(calls - before, CUSTOMER_PERMISSIONS.length);
    assert.equal(sessionCalls - sessionBefore, CUSTOMER_PERMISSIONS.length);
    assert.deepEqual(await boundary.requireBrowserCustomer(browser()), { kind: "customer", userId: userA, sessionId: sessionA });
    const injectedBody = new Request(browser(), { body: JSON.stringify({ userId: userB, permissions: ["checkout:execute"] }) });
    const issued = await boundary.delegateFromBrowser(injectedBody);
    assert.equal((await boundary.authenticateInvocation(mcp(issued), "cart:read")).userId, userA);
  });
  await check("credential objects serialize without secrets or customer/session tokens", async () => {
    assert.deepEqual(JSON.parse(JSON.stringify(delegation!)), { redacted: true });
    assert.equal(Object.keys(delegation!).length, 0);
    const header = delegation!.transportHeaders();
    header.delete("authorization");
    assert(delegation!.transportHeaders().has("authorization"));
    const request = delegation!.transportRequest("{}");
    assert.equal(request.url, `${config.origin}/api/mcp`);
    assert.equal(request.redirect, "error");
    assert.equal(request.cache, "no-store");
    const raw = delegation!.transportHeaders().get("authorization")!.slice(7);
    assert(!JSON.stringify(decodeJwt(raw)).includes(currentToken!));
  });
  await check("unsigned, forged, malformed, oversized and wrong-key requests are rejected before session lookups", async () => {
    const original = delegation!.transportHeaders().get("authorization")!.slice(7);
    const claims = decodeJwt(original);
    const bad = ["", "not-a-jwt", original.slice(0, -4) + "AAAA", "a".repeat(5000),
      await sign(claims, { key: otherKey }), await sign(claims, { kid: "missing" }),
      await sign(claims, { typ: "JWT" }), `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.`];
    const before = calls;
    await reject(() => boundary.authenticateInvocation(new Request("https://other.example/api/mcp", { headers: delegation!.transportHeaders() }), "cart:read"));
    for (const token of bad) {
      const request = new Request(`${config.origin}/api/mcp`, { headers: { authorization: `Bearer ${token}`, [SESSION_PROOF_HEADER]: currentToken! } });
      await reject(() => boundary.authenticateInvocation(request, "cart:read"));
    }
    assert.equal(calls, before);
  });
  await check("issuer, exact audience, expiry, lifetime, identity and scope claims are enforced", async () => {
    const raw = delegation!.transportHeaders().get("authorization")!.slice(7), claims = decodeJwt(raw);
    const invalid = [
      { iss: "urn:other:issuer" }, { aud: "urn:wrong:audience" }, { aud: [config.audience, "urn:other:audience"] },
      { exp: time }, { exp: time + 31 }, { iat: time + 1 }, { nbf: time + 1 },
      { jti: "invalid" }, { kind: "admin" }, { sub: userB }, { sid: sessionB }, { session_hash: "wrong" },
      { permissions: ["checkout:execute"] }, { permissions: ["catalog:read", "catalog:read"] }, { permissions: [] },
    ];
    for (const mutation of invalid) {
      const request = new Request(`${config.origin}/api/mcp`, { headers: { authorization: `Bearer ${await sign({ ...claims, ...mutation })}`, [SESSION_PROOF_HEADER]: currentToken! } });
      await reject(() => boundary.authenticateInvocation(request, "catalog:read"));
    }
    const missing = { ...claims }; delete missing.sub;
    const missingToken = await sign(missing);
    await reject(() => boundary.authenticateInvocation(new Request(`${config.origin}/api/mcp`, { headers: { authorization: `Bearer ${missingToken}` } }), "catalog:read"));
    time += 30;
    await reject(() => boundary.authenticateInvocation(mcp(delegation!), "cart:read"));
    time -= 30;
    simulateAuthDelay = 31;
    await reject(() => boundary.authenticateInvocation(mcp(delegation!), "cart:read"));
    time -= 31;
    simulateAuthDelay = 0;
  });
  await check("permission enforcement rejects hidden operations and private anonymous claims", async () => {
    const claims = decodeJwt(delegation!.transportHeaders().get("authorization")!.slice(7));
    const token = await sign({ ...claims, permissions: ["catalog:read"] });
    const request = new Request(`${config.origin}/api/mcp`, { headers: { authorization: `Bearer ${token}`, [SESSION_PROOF_HEADER]: currentToken! } });
    await reject(() => boundary.authenticateInvocation(request, "cart:write"), 403);
    await reject(() => boundary.authenticateInvocation(mcp(delegation!), "admin:write" as Permission), 403);
    const anon = await sign({ ...claims, sub: "anonymous", kind: "anonymous", permissions: ["cart:read"] });
    await reject(() => boundary.authenticateInvocation(new Request(`${config.origin}/api/mcp`, { headers: { authorization: `Bearer ${anon}` } }), "cart:read"));
  });
  await check("cross-user, cross-session and refreshed-token substitution are rejected", async () => {
    for (const proof of [await accessToken(userB, sessionB), await accessToken(userA, randomUUID()), await accessToken()]) {
      const headers = delegation!.transportHeaders(); headers.set(SESSION_PROOF_HEADER, proof);
      await reject(() => boundary.authenticateInvocation(new Request(`${config.origin}/api/mcp`, { headers }), "cart:write"));
    }
    const headers = delegation!.transportHeaders(); headers.delete(SESSION_PROOF_HEADER);
    await reject(() => boundary.authenticateInvocation(new Request(`${config.origin}/api/mcp`, { headers }), "cart:read"));
  });
  await check("logout/deleted sessions revoke outstanding delegation even when the JWT is unexpired", async () => {
    active.delete(`${userA}:${sessionA}`);
    await reject(() => boundary.authenticateInvocation(mcp(delegation!), "orders:read"));
    await reject(() => boundary.delegateFromBrowser(browser()));
    active.add(`${userA}:${sessionA}`);
    currentToken = null;
    await reject(() => boundary.requireBrowserCustomer(browser()));
    const anonymous = await boundary.delegateFromBrowser(browser());
    assert.equal((await boundary.authenticateInvocation(mcp(anonymous), "catalog:read")).kind, "anonymous");
    currentToken = await accessToken(userB, sessionB);
    const next = await boundary.delegateFromBrowser(browser());
    assert.equal((await boundary.authenticateInvocation(mcp(next), "profile:read")).userId, userB);
    currentToken = await accessToken();
    delegation = await boundary.delegateFromBrowser(browser());
  });
  await check("invalid cookie sessions never silently downgrade to anonymous; outages fail closed", async () => {
    currentToken = "forged-cookie-token";
    await reject(() => boundary.delegateFromBrowser(browser()));
    tokenReadFailure = true; await reject(() => boundary.delegateFromBrowser(browser())); tokenReadFailure = false;
    currentToken = await accessToken();
    anonymousAuthUser = true;
    await reject(() => boundary.delegateFromBrowser(browser()));
    anonymousAuthUser = false;
    supabaseFailure = true; await reject(() => boundary.delegateFromBrowser(browser()), 503); supabaseFailure = false;
    databaseFailure = true; await reject(() => boundary.authenticateInvocation(mcp(delegation!), "cart:read"), 503); databaseFailure = false;
    currentToken = await accessToken(userA, sessionA, time);
    await reject(() => boundary.delegateFromBrowser(browser()));
    currentToken = await accessToken(userA, sessionA, time + 5);
    const short = await boundary.delegateFromBrowser(browser());
    const payload = decodeJwt(short.transportHeaders().get("authorization")!.slice(7));
    assert.equal(payload.exp, time + 5);
    currentToken = await accessToken();
  });
  await check("CSRF and cross-origin browser requests are rejected before authentication", async () => {
    const before = calls;
    for (const request of [
      browser({ origin: "https://attacker.example" }), browser({ origin: "null" }),
      browser({ "sec-fetch-site": "same-site" }), browser({ "sec-fetch-site": "cross-site" }),
      browser({ "content-type": "text/plain" }), browser({}, "GET"),
      browser({}, "POST", "https://attacker.example/api/chat/tool"),
      new Request(`${config.origin}/api/chat/tool`, { method: "POST", headers: { "content-type": "application/json" } }),
    ]) await reject(() => boundary.delegateFromBrowser(request), 403);
    assert.equal(calls, before);
    assert.doesNotThrow(() => assertTrustedBrowserMutation(browser({ "content-type": "application/json; charset=utf-8" }), config.origin));
  });
  await check("rotation accepts overlap keys and rejects retired keys", async () => {
    const rotatedConfig = readBoundaryConfig({ ...env, THREADCORE_MCP_SIGNING_KID: "next", THREADCORE_MCP_SIGNING_KEYS: JSON.stringify({ current: key.toString("base64url"), next: otherKey.toString("base64url") }) });
    const rotated = createAuthenticationBoundary(rotatedConfig, { now: () => time, readAccessToken: async () => null, verifyUser: async () => null, sessionIsActive: async () => false });
    const oldAnon = await createAuthenticationBoundary(config, { now: () => time, readAccessToken: async () => null, verifyUser: async () => null, sessionIsActive: async () => false }).delegateFromBrowser(browser());
    assert.equal((await rotated.authenticateInvocation(mcp(oldAnon), "catalog:read")).kind, "anonymous");
    const fresh = await rotated.delegateFromBrowser(browser());
    const retired = createAuthenticationBoundary({ ...rotatedConfig, keys: new Map([["next", otherKey]]) }, { now: () => time, readAccessToken: async () => null, verifyUser: async () => null, sessionIsActive: async () => false });
    await reject(() => retired.authenticateInvocation(mcp(oldAnon), "catalog:read"));
    assert.equal((await retired.authenticateInvocation(mcp(fresh), "catalog:read")).kind, "anonymous");
  });
  await check("invalid secret/origin configuration fails without disclosing environment values", () => {
    for (const change of [
      { THREADCORE_MCP_SIGNING_KEYS: "bad-secret-material" }, { THREADCORE_MCP_SIGNING_KID: "missing" },
      { THREADCORE_APP_ORIGIN: "https://store.example/" }, { THREADCORE_APP_ORIGIN: "https://user:password@store.example" },
      { THREADCORE_APP_ORIGIN: "http://store.example" }, { THREADCORE_MCP_AUDIENCE: "" },
      { THREADCORE_MCP_SIGNING_KEYS: JSON.stringify({ current: "short" }) },
    ]) assert.throws(() => readBoundaryConfig({ ...env, ...change }), (e: unknown) => e instanceof McpAuthError && e.message === "AUTH_UNAVAILABLE");
    assert.doesNotThrow(() => readBoundaryConfig({ ...env, THREADCORE_APP_ORIGIN: "http://localhost:3000" }));
    assert.throws(() => readBoundaryConfig({ ...env, NODE_ENV: "production", THREADCORE_APP_ORIGIN: "http://localhost:3000" }));
  });
  await check("auth errors are sanitized, uncached JSON and API paths do not overmatch", async () => {
    const response = authenticationErrorResponse(new Error("database password and JWT"));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: { code: "AUTH_UNAVAILABLE" } });
    assert(response.headers.get("cache-control")?.includes("no-store"));
    const login = authenticationErrorResponse(new McpAuthError(401, "LOGIN_REQUIRED"));
    assert.equal(login.status, 401); assert(login.headers.has("www-authenticate"));
    for (const path of ["/api/mcp", "/api/chat", "/api/chat/confirm"]) assert(isIntegrationApiPath(path));
    for (const path of ["/api/mcp-other", "/api/mcp/unknown", "/api/chatty", "/cart"]) assert(!isIntegrationApiPath(path));
  });
  await check("preserved redirect and Supabase normalization regressions", () => {
    for (const path of ["/", "/checkout", "/orders?status=active#details"]) assert.equal(getSafeRedirectPath(path), path);
    assert.equal(getSafeRedirectPath("  /profile  "), "/profile");
    for (const path of ["", null, undefined, "//evil.com", "//evil.com/path", "///evil.com", "/\\evil.com", "\\evil.com", "/foo\\bar", "https://evil.com", "http://evil.com", "javascript:alert(1)", "data:text/html,test"]) assert.equal(getSafeRedirectPath(path), "/");
    assert.equal(getSafeRedirectPath("https://evil.com", "/dashboard"), "/dashboard");
    const original = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
    try {
      for (const suffix of ["/rest/v1", "/rest/v1/", "/auth/v1", "/"]) {
        process.env.NEXT_PUBLIC_SUPABASE_URL = `https://example.supabase.co${suffix}`;
        assert.equal(getSupabaseUrl(), "https://example.supabase.co");
      }
      for (const value of ['"https://example.supabase.co"', "  'https://example.supabase.co'  "]) {
        process.env.NEXT_PUBLIC_SUPABASE_URL = value; assert.equal(getSupabaseUrl(), "https://example.supabase.co");
      }
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ' "public-test-value" ';
      assert.equal(getSupabaseAnonKey(), "public-test-value");
    } finally {
      if (original.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = original.url;
      if (original.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = original.key;
    }
  });
  console.log(`${passed} authentication test groups passed. No external services used.`);
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Authentication tests failed"); process.exitCode = 1; });
