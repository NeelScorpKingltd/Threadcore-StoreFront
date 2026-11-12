import React from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCart } from "@/services/cart.service";
import { getAddresses } from "@/services/user.service";
import { CheckoutClient } from "@/components/CheckoutClient";

export default async function CheckoutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?message=Sign+in+to+complete+your+order");
  }

  const { items, subtotalCents } = await getCart(user.id);

  if (items.length === 0) {
    redirect("/cart");
  }

  const addresses = await getAddresses(user.id);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
          Instant Checkout
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Verify your shipping address and confirm your order in one click.
        </p>
      </div>

      <CheckoutClient
        initialAddresses={addresses}
        cartItems={items}
        subtotalCents={subtotalCents}
      />
    </div>
  );
}
