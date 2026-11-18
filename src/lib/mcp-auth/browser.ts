import "server-only";
import { McpAuthError } from "./types";

// Apply at every future browser-facing chat mutation AND confirmation route.
// Do not infer the trusted origin from Host/X-Forwarded-Host supplied by a caller.
export function assertTrustedBrowserMutation(request: Request, origin: string) {
  const type = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  const site = request.headers.get("sec-fetch-site");
  if (request.method !== "POST" || new URL(request.url).origin !== origin ||
      request.headers.get("origin") !== origin || type !== "application/json" ||
      (site !== null && site !== "same-origin")) {
    throw new McpAuthError(403, "FORBIDDEN");
  }
}
