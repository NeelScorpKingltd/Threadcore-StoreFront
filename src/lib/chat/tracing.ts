import "server-only";
import { trace, SpanStatusCode, type Attributes } from "@opentelemetry/api";
import type { ToolDiagnostic } from "./tool-diagnostics";

export function traceToolFailure(diagnostic: ToolDiagnostic) {
  if (process.env.VERCEL_ENV !== "preview") return;
  const span = trace.getActiveSpan();
  span?.setStatus({ code: SpanStatusCode.ERROR });
  span?.setAttributes({ "tool.error.category": diagnostic.category, "tool.error.fields": diagnostic.fields });
}

// Callers supply fixed stage names and allowlisted scalar metadata only.
// Never record arguments, SQL, payloads, identities or exception messages.
export async function traceStage<T>(name: string, work: () => Promise<T>, attributes: Attributes = {}): Promise<T> {
  if (process.env.VERCEL_ENV !== "preview") return work();
  return trace.getTracer("threadcore-chat").startActiveSpan(name, { attributes }, async (span) => {
    try { return await work(); }
    catch (error) { span.setStatus({ code: SpanStatusCode.ERROR }); throw error; }
    finally { span.end(); }
  });
}

export function traceMetric(name: string, value: number) {
  if (process.env.VERCEL_ENV === "preview" && Number.isFinite(value)) {
    trace.getActiveSpan()?.setAttribute(name, value);
  }
}
