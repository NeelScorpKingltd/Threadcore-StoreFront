import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { McpTester } from "@/components/McpTester";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "MCP test console | ThreadCore",
  robots: { index: false, follow: false },
};

export default async function McpTestPage() {
  if (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview") {
    notFound();
  }

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  return <McpTester />;
}
