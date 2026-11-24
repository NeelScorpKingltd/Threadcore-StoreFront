export const CUSTOMER_PERMISSIONS = [
  "catalog:read", "cart:read", "cart:write", "profile:read",
  "addresses:read", "addresses:propose", "orders:read", "orders:propose",
] as const;
export type Permission = typeof CUSTOMER_PERMISSIONS[number];
export type Principal =
  | Readonly<{ kind: "anonymous"; userId: null }>
  | Readonly<{ kind: "customer"; userId: string; sessionId: string }>;

export class McpAuthError extends Error {
  constructor(readonly status: 401 | 403 | 503, readonly code: "LOGIN_REQUIRED" | "INVALID_CREDENTIAL" | "FORBIDDEN" | "AUTH_UNAVAILABLE") {
    super(code);
  }
}
