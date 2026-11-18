import { privateMcpAuthentication } from "@/lib/mcp-auth/server";
import { authenticationErrorResponse } from "@/lib/mcp-auth/http";
import { decide, listPending } from "@/lib/mcp/pending";
import { confirmationBody } from "@/lib/mcp/confirmation-schema";
import { DomainError } from "@/lib/domain/errors";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const headers = { "cache-control": "no-store, private" };
  try {
    const user = await privateMcpAuthentication().requireBrowserCustomer(request);
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 4096) return Response.json({ error: "REQUEST_TOO_LARGE" }, { status: 413, headers });
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers }); }
    const parsed = confirmationBody.safeParse(body);
    if (!parsed.success) return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
    return Response.json("operation" in parsed.data ? { actions: await listPending(user.userId) }
      : await decide(user.userId, parsed.data.id, parsed.data.confirm), { headers });
  } catch (error) {
    if (error instanceof DomainError) return Response.json({ error: error.message }, { status: 409, headers });
    return authenticationErrorResponse(error);
  }
}
