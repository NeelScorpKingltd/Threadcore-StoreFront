import Link from "next/link";
import { signUp } from "@/app/actions/auth.actions";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          Create an account
        </h1>
        <p className="text-sm text-stone-500">
          Join ThreadCore for curated essentials
        </p>
      </div>

      {/* Messages */}
      {message && (
        <div className="rounded-md border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
          {message}
        </div>
      )}

      {/* Form */}
      <form action={signUp} className="space-y-5">
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
            autoComplete="new-password"
            placeholder="••••••••"
            className="block w-full rounded-md border border-stone-200/80 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400 transition-colors"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-2 focus:ring-offset-[#FAF9F6] transition-colors"
        >
          Create account
        </button>
      </form>

      {/* Footer */}
      <p className="text-center text-sm text-stone-500">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-stone-900 underline underline-offset-4 hover:text-stone-700 transition-colors"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
