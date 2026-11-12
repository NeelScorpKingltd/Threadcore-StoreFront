import React from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAddresses } from "@/services/user.service";
import { ProfileAddressManager } from "@/components/ProfileAddressManager";
import { ProfileNameEditor } from "@/components/ProfileNameEditor";
import { User, Shield, Package } from "lucide-react";
import Link from "next/link";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?message=Sign+in+to+view+your+profile");
  }

  const fullName = (user.user_metadata?.full_name as string) || "";
  const addresses = await getAddresses(user.id);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
          Account Profile
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Manage your personal details, credentials, and saved shipping addresses.
        </p>
      </div>

      {/* Account Info Card with Name Editor */}
      <div className="rounded-lg border border-stone-200/80 bg-white p-6 shadow-xs space-y-6">
        <div className="flex items-center space-x-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-stone-900">
            <User className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-stone-900">
              {fullName || user.email}
            </h2>
            <p className="text-xs text-stone-500">{user.email}</p>
          </div>
        </div>

        {/* Profile Name Field (Item 6) */}
        <ProfileNameEditor initialName={fullName} email={user.email || ""} />

        {/* Quick Links / Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-stone-100 pt-6">
          <Link
            href="/orders"
            className="flex items-center space-x-3 rounded-md border border-stone-200/80 p-3 hover:bg-stone-50 transition-colors"
          >
            <Package className="h-4 w-4 text-stone-600" />
            <div className="text-xs">
              <span className="font-semibold text-stone-900 block">
                View Past Orders
              </span>
              <span className="text-stone-500">Check tracking & history</span>
            </div>
          </Link>

          <div className="flex items-center space-x-3 rounded-md border border-stone-200/80 p-3">
            <Shield className="h-4 w-4 text-emerald-700" />
            <div className="text-xs">
              <span className="font-semibold text-stone-900 block">
                Session Verified
              </span>
              <span className="text-stone-500">Supabase SSR Authenticated</span>
            </div>
          </div>
        </div>
      </div>

      {/* Saved Addresses Section */}
      <ProfileAddressManager initialAddresses={addresses} />
    </div>
  );
}
