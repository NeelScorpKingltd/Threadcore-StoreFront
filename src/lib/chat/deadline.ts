import "server-only";
import { ChatHttpError } from "./http-limits";

export async function withMcpDeadline<T>(work: (signal: AbortSignal) => Promise<T>, milliseconds = 20_000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new ChatHttpError(504, "MCP_TIMEOUT");
      controller.abort(error);
      reject(error);
    }, milliseconds);
  });
  try { return await Promise.race([work(controller.signal), expired]); }
  finally { clearTimeout(timer); }
}
