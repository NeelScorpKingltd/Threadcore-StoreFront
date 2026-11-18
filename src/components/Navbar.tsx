import React from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCart } from "@/services/cart.service";
import { ShoppingBag, User, LogOut } from "lucide-react";
import { signOut } from "@/app/actions/auth.actions";

export async function Navbar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let totalItems = 0;
  if (user) {
    try {
      const cart = await getCart(user.id);
      totalItems = cart.totalItems;
    } catch {
      totalItems = 0;
    }
  }

  const displayName =
    (user?.user_metadata?.full_name as string) || user?.email || "";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-stone-200/80 bg-[#FAF9F6]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <div className="flex items-center space-x-8">
          <Link
            href="/"
            className="text-lg font-bold tracking-widest text-stone-900 uppercase"
          >
            ThreadCore
          </Link>

          <nav className="hidden md:flex items-center space-x-8">
            <Link
              href="/"
              className="text-xs uppercase tracking-widest font-medium text-stone-500 transition-colors hover:text-stone-900"
            >
              Collection
            </Link>
            <Link
              href="/orders"
              className="text-xs uppercase tracking-widest font-medium text-stone-500 transition-colors hover:text-stone-900"
            >
              Orders
            </Link>
            <Link
              href="/profile"
              className="text-xs uppercase tracking-widest font-medium text-stone-500 transition-colors hover:text-stone-900"
            >
              Profile
            </Link>
            {user && (process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV === "development") && (
              <Link
                href="/mcp-test"
                className="text-xs uppercase tracking-widest font-medium text-stone-500 transition-colors hover:text-stone-900"
              >
                MCP Test
              </Link>
            )}
          </nav>
        </div>

        {/* Right Actions: Profile on left, Cart Button on the far right */}
        <div className="flex items-center space-x-4 sm:space-x-5">
          <Link href="/chat" className="text-xs font-medium text-stone-700 hover:underline">Chat</Link>
          {/* User / Profile Section */}
          {user ? (
            <div className="flex items-center space-x-3">
              <Link
                href="/profile"
                className="flex items-center space-x-1.5 text-xs text-stone-600 hover:text-stone-900 transition-colors p-1"
                title="Account Profile"
              >
                <User className="h-4 w-4" />
                <span className="max-w-[120px] truncate hidden sm:inline font-medium">
                  {displayName}
                </span>
              </Link>
              <form action={signOut}>
                <button
                  type="submit"
                  title="Sign out"
                  className="flex items-center text-stone-400 hover:text-stone-900 transition-colors p-1"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
            </div>
          ) : (
            <Link
              href="/login"
              className="flex items-center space-x-1 rounded-md border border-stone-200/80 bg-white px-3 py-1.5 text-xs font-medium text-stone-900 hover:bg-stone-50 transition-colors"
            >
              <User className="h-3.5 w-3.5" />
              <span>Sign In</span>
            </Link>
          )}

          {/* Cart Button: Top right, immediately to the right of Profile icon */}
          <Link
            href="/cart"
            className="group relative flex items-center p-2 rounded-full text-stone-700 hover:text-stone-900 hover:bg-stone-100 transition-colors"
            aria-label="Shopping Cart"
          >
            <ShoppingBag className="h-5 w-5" />
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-stone-900 px-1 font-mono text-[10px] font-semibold text-white">
                {totalItems}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
