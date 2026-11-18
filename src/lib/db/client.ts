import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;
const endpoint = (() => {
  try {
    const url = new URL(connectionString);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
    return url;
  } catch { throw new Error("Invalid database configuration"); }
})();
const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
// TLS options come from reviewed configuration, never sslmode flags that weaken
// validation in a pasted connection URL.
endpoint.searchParams.delete("sslmode");
endpoint.searchParams.delete("ssl");

// Disable prefetch/prepare for Supabase Transaction Pooler (port 6543)
const client = postgres(endpoint.toString(), {
  prepare: false, max: 4, connect_timeout: 10, idle_timeout: 20, max_lifetime: 300,
  ssl: local ? false : { rejectUnauthorized: true,
    ...(process.env.THREADCORE_DB_CA_PEM ? { ca: process.env.THREADCORE_DB_CA_PEM } : {}) },
});
export const db = drizzle(client, { schema });
