import "server-only";

export class ChatHttpError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

export async function readLimitedJson(request: Request, limit: number): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length !== null && /^\d+$/.test(length) && Number(length) > limit) {
    throw new ChatHttpError(413, "REQUEST_TOO_LARGE");
  }
  if (!request.body) throw new ChatHttpError(400, "INVALID_REQUEST");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        void reader.cancel().catch(() => {});
        throw new ChatHttpError(413, "REQUEST_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks, size).toString("utf8")); }
  catch { throw new ChatHttpError(400, "INVALID_REQUEST"); }
}

export function limitedJsonResponse(value: unknown, limit = 512 * 1024): Response {
  const body = JSON.stringify(value);
  if (Buffer.byteLength(body) > limit) throw new ChatHttpError(502, "RESULT_TOO_LARGE");
  return new Response(body, { headers: {
    "content-type": "application/json", "cache-control": "no-store, private", vary: "Cookie",
  } });
}

export function chatHttpErrorResponse(error: ChatHttpError) {
  return Response.json({ error: { code: error.code } }, {
    status: error.status, headers: { "cache-control": "no-store, private", vary: "Cookie",
      ...(error.status === 429 ? { "retry-after": "60" } : {}) },
  });
}
