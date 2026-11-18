import "server-only";
import { ChatHttpError } from "./http-limits";

let active = 0;
// Per-process admission bound; aggregate capacity still depends on Vercel scaling.
export async function withChatCapacity<T>(work: () => Promise<T>): Promise<T> {
  if (active >= 8) throw new ChatHttpError(503, "CAPACITY_UNAVAILABLE");
  active++;
  try { return await work(); } finally { active--; }
}
