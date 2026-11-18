import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseUrl, getSupabaseAnonKey } from "./config";
import { isIntegrationApiPath } from "@/lib/mcp-auth/paths";

export async function updateSession(request: NextRequest) {
  if (isIntegrationApiPath(request.nextUrl.pathname)) {
    // MCP validates signed backend credentials; chat handlers verify cookies and
    // origin themselves. Anonymous catalogue use must not become a login redirect.
    return NextResponse.next({ request });
  }
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public paths accessible without authentication:
  // - / (Catalog collection)
  // - /products/* (Product details)
  // - /login, /signup, /auth, /api/auth (Auth flows)
  const publicPaths = ["/login", "/signup", "/auth", "/api/auth", "/products"];
  const isPublicPath = publicPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (!user && !isPublicPath && !["/", "/chat"].includes(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
