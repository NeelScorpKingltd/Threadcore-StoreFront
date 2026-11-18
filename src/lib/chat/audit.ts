import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

type Stage = "received" | "rate_limit" | "authentication" | "configuration" | "supabase_user" | "session_database" | "transport" | "input" | "tool" | "confirmation";
type Context = { stage: Stage; requestId: string };
const context = new AsyncLocalStorage<Context>();

export function auditStage(stage: Stage) { const current = context.getStore(); if (current) current.stage = stage; }

// Only fixed categories and server-generated IDs enter logs. Never accept arbitrary
// request headers, bodies, error messages/stacks, identities or tool results here.
export async function auditRequest(route: "tools" | "confirm" | "mcp", work: () => Promise<Response>): Promise<Response> {
  const requestId = randomUUID();
  const started = Date.now();
  const state: Context = { stage: "received", requestId };
  return context.run(state, async () => {
    let status = 500;
    try {
      const response = await work();
      status = response.status;
      response.headers.set("x-threadcore-request-id", requestId);
      return response;
    } finally {
      try {
        const entry = JSON.stringify({ event: "chat_request", route, requestId,
          stage: state.stage, httpStatus: status, durationMs: Date.now() - started });
        if (status >= 500) console.error(entry);
        else if (status >= 400) console.warn(entry);
        else console.info(entry);
      } catch { /* Observability failures must not change a committed operation. */ }
    }
  });
}

export function auditToolOutcome(tool: "catalog_read" | "cart_read" | "cart_write" | "profile_read" | "addresses_read" | "addresses_write" | "orders_read" | "orders_write", failed: boolean) {
  try { console.info(JSON.stringify({ event: "chat_tool", requestId: context.getStore()?.requestId, tool, outcome: failed ? "failed" : "completed" })); }
  catch { /* Never retry a mutation because logging failed. */ }
}

export function auditConfirmation(confirm: boolean, status: unknown) {
  const outcome = typeof status === "string" && ["executed", "rejected", "expired"].includes(status) ? status : "unknown";
  try { console.info(JSON.stringify({ event: "chat_confirmation", requestId: context.getStore()?.requestId,
    decision: confirm ? "confirm" : "reject", outcome })); } catch { /* Logging cannot alter transaction outcomes. */ }
}
