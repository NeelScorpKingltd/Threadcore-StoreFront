import "server-only";

export type ToolDiagnostic = {
  category: "validation" | "authentication" | "authorization" | "operation" | "protocol" | "transport";
  fields: string[];
};
const fields = new Set(["operation", "category", "search", "inStockOnly", "limit", "offset", "id", "sku", "productId", "quantity", "cartItemId", "requestId", "orderId", "reason", "street", "city", "state", "postalCode", "country", "isDefault", "addressId"]);

// Inspect errors locally. Only fixed categories and known schema field names escape.
export function toolDiagnostic(result: Record<string, unknown>): ToolDiagnostic | undefined {
  if (result.isError !== true) return;
  const content = Array.isArray(result.content) ? result.content : [];
  const messages = content.flatMap(item => item && typeof item === "object" && item.type === "text" && typeof item.text === "string" ? [item.text.slice(0, 8192)] : []);
  const message = messages.join("\n");
  let category: ToolDiagnostic["category"] = "protocol";
  if (/Input validation error|MCP error -32602/.test(message)) category = "validation";
  else {
    for (const text of messages) {
      try {
        const code = JSON.parse(text)?.error?.code;
        if (["LOGIN_REQUIRED", "INVALID_CREDENTIAL", "AUTH_UNAVAILABLE"].includes(code)) category = "authentication";
        else if (code === "FORBIDDEN") category = "authorization";
        else if (code === "OPERATION_FAILED") category = "operation";
      } catch { /* SDK validation errors may contain plain text. */ }
    }
  }
  const paths = new Set<string>();
  if (category === "validation") {
    for (const match of message.matchAll(/"path"\s*:\s*(\[[^\]]*\])/g)) {
      try {
        const path: unknown = JSON.parse(match[1]);
        if (Array.isArray(path)) for (const name of path) if (typeof name === "string" && fields.has(name)) paths.add(name);
      } catch { /* Malformed diagnostics are omitted. */ }
    }
  }
  return { category, fields: [...paths].slice(0, 8) };
}
