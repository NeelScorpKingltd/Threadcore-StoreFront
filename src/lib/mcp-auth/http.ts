import "server-only";
import { McpAuthError } from "./types";

export function authenticationErrorResponse(error: unknown): Response {
  const known = error instanceof McpAuthError ? error : new McpAuthError(503, "AUTH_UNAVAILABLE");
  const headers = new Headers({ "cache-control": "no-store, private", pragma: "no-cache", vary: "Cookie, Authorization" });
  if (known.status === 401) headers.set("www-authenticate", 'Bearer realm="threadcore-private-mcp"');
  return Response.json({ error: { code: known.code } }, { status: known.status, headers });
}
