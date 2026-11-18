import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { ChatHttpError } from "./http-limits";

// Stable row per subject, reset with database time. Atomic across instances.
// No caller-supplied IP or user ID is trusted. Anonymous users share a budget.
export async function enforceChatRateLimit(subject: string, limit: number) {
  const key = createHash("sha256").update(subject).digest("hex");
  try {
    const [row] = await db.execute<{ allowed: boolean }>(sql`
      insert into public.mcp_rate_limits as counters(bucket_key, window_start, hits)
      values (${key}, date_trunc('minute', statement_timestamp()), 1)
      on conflict (bucket_key) do update set
        window_start = date_trunc('minute', statement_timestamp()),
        hits = case when counters.window_start < date_trunc('minute', statement_timestamp())
          then 1 else least(counters.hits, ${limit}) + 1 end
      returning hits <= ${limit} as allowed
    `);
    if (!row?.allowed) throw new ChatHttpError(429, "RATE_LIMITED");
  } catch (error) {
    if (error instanceof ChatHttpError) throw error;
    throw new ChatHttpError(503, "RATE_LIMIT_UNAVAILABLE");
  }
}
