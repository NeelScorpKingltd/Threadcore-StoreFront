import { chatBody, runAgent, type ChatEvent } from "@/lib/chat/agent";
import { withChatTools } from "@/lib/chat/adapter";
import { readBoundaryConfig } from "@/lib/mcp-auth/config";
import { assertTrustedBrowserMutation } from "@/lib/mcp-auth/browser";
import { authenticationErrorResponse } from "@/lib/mcp-auth/http";
import { ChatHttpError, chatHttpErrorResponse, readLimitedJson } from "@/lib/chat/http-limits";
import { enforceChatRateLimit } from "@/lib/chat/rate-limit";
import { auditAgentOutcome, auditRequest } from "@/lib/chat/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  return auditRequest("message", async () => {
    try {
      assertTrustedBrowserMutation(request, readBoundaryConfig().origin);
      await enforceChatRateLimit("global:message", 30);
      let key = request.headers.get("x-openai-key")?.trim() || "";
      if (!key && process.env.VERCEL_ENV === "preview") key = process.env.THREADCORE_OPENAI_STAGING_KEY || "";
      if (!/^[\x21-\x7e]{20,300}$/.test(key)) throw new ChatHttpError(400, "OPENAI_KEY_REQUIRED");
      const parsed = chatBody.safeParse(await readLimitedJson(request, 32 * 1024));
      if (!parsed.success) throw new ChatHttpError(400, "INVALID_REQUEST");
      if (parsed.data.messages.some((message) => message.content.includes(key))) throw new ChatHttpError(400, "KEY_IN_MESSAGE");
      const abort = new AbortController();
      const signal = AbortSignal.any([request.signal, abort.signal, AbortSignal.timeout(95_000)]);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          let sent = 0;
          const emit = (event: ChatEvent) => {
            signal.throwIfAborted();
            const bytes = encoder.encode(JSON.stringify(event) + "\n");
            sent += bytes.byteLength;
            if (sent > 256 * 1024) throw new Error("OUTPUT_LIMIT");
            controller.enqueue(bytes);
          };
          void withChatTools(request, (client) => runAgent(client, key, parsed.data, signal, emit), 95_000)
            .then(() => { auditAgentOutcome(signal.aborted ? "aborted" : "completed"); if (!signal.aborted) emit({ type: "done" }); })
            .catch(() => {
              auditAgentOutcome(signal.aborted ? "aborted" : "unavailable");
              if (!signal.aborted) {
                try { emit({ type: "error", message: "I'm unable to help right now. Check your key, usage limits, or try again later. A cart change may have completed; check your cart before requesting it again." }); }
                catch { /* output cap or closed browser stream */ }
              }
            })
            .finally(() => { key = ""; try { controller.close(); } catch { /* client disconnected */ } });
        },
        cancel() { abort.abort(); key = ""; },
      });
      return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store, private", vary: "Cookie", "x-content-type-options": "nosniff" } });
    } catch (error) { return error instanceof ChatHttpError ? chatHttpErrorResponse(error) : authenticationErrorResponse(error); }
  });
}
