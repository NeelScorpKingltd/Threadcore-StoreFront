// These API routes authenticate within their handlers, not by HTML redirects.
export function isIntegrationApiPath(path: string) {
  return path === "/api/mcp" || path === "/api/chat" || path.startsWith("/api/chat/");
}
