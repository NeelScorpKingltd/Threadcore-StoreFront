import { StoreChat } from "@/components/StoreChat";
import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default async function ChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <StoreChat userId={user?.id ?? null} stagingKeyAvailable={process.env.VERCEL_ENV === "preview" && Boolean(process.env.THREADCORE_OPENAI_STAGING_KEY)} />;
}
