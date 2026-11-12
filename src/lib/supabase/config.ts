/**
 * Normalizes the Supabase URL by trimming whitespace, stripping wrapping quotes,
 * and removing any trailing slashes or accidental path suffixes like `/rest/v1` or `/auth/v1`.
 */
export function getSupabaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  let cleaned = raw.trim().replace(/^["']|["']$/g, "").trim();
  cleaned = cleaned.replace(/\/+$/, "");
  cleaned = cleaned.replace(/\/(rest|auth)\/v1$/, "");
  cleaned = cleaned.replace(/\/+$/, "");
  return cleaned;
}

/**
 * Normalizes the Supabase Anon Key by trimming whitespace and stripping wrapping quotes.
 */
export function getSupabaseAnonKey(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return raw.trim().replace(/^["']|["']$/g, "").trim();
}
