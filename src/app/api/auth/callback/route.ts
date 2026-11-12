import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Validates that a redirect target is a safe, internal relative path.
 * Rejects external URLs, protocol-relative URLs (//evil.com), backslash evasion (/\evil.com),
 * and non-http(s) schemes (javascript:).
 */
export function getSafeRedirectPath(
  next: string | null | undefined,
  fallback = "/"
): string {
  if (!next || typeof next !== "string") {
    return fallback;
  }

  const trimmed = next.trim();
  if (!trimmed) {
    return fallback;
  }

  // Must begin with a single slash '/'
  // Must NOT begin with '//' (protocol-relative URL)
  // Must NOT begin with '/\' or contain backslash anywhere (browser path normalization tricks)
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\") ||
    trimmed.includes("\\")
  ) {
    return fallback;
  }

  try {
    // Parse using a fixed dummy localhost origin to test path resolution
    const dummyOrigin = "http://localhost";
    const parsed = new URL(trimmed, dummyOrigin);

    // The origin must remain the dummy origin (ensures no protocol or authority smuggling)
    if (parsed.origin !== dummyOrigin) {
      return fallback;
    }

    // Pathname must still be a root-relative path and not protocol-relative
    if (!parsed.pathname.startsWith("/") || parsed.pathname.startsWith("//")) {
      return fallback;
    }

    // Return the safe pathname + search params + hash fragment
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");
  const safeNext = getSafeRedirectPath(rawNext, "/");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=Could+not+authenticate`);
}
