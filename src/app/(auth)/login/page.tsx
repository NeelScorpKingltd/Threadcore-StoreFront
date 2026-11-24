import Link from "next/link";
import { signIn } from "@/app/actions/auth.actions";
import { getSafeRedirectPath } from "@/lib/supabase/redirect";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string; next?: string }>;
}) {
  const { message, error, next } = await searchParams;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          Welcome back
        </h1>
        <p className="text-sm text-stone-500">
          Sign in to your ThreadCore account
        </p>
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-md border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
          {message}
        </div>
      )}

      {/* Form */}
      <form action={signIn} className="space-y-5">
        <input type="hidden" name="next" value={getSafeRedirectPath(next)} />
        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-stone-700"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="block w-full rounded-md border border-stone-200/80 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400 transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-stone-700"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className="block w-full rounded-md border border-stone-200/80 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400 transition-colors"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-2 focus:ring-offset-[#FAF9F6] transition-colors"
        >
          Sign in
        </button>
      </form>

      {/* Footer */}
      <p className="text-center text-sm text-stone-500">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-medium text-stone-900 underline underline-offset-4 hover:text-stone-700 transition-colors"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
