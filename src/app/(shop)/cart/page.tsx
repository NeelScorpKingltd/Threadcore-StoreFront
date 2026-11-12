import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCart } from "@/services/cart.service";
import { formatPrice } from "@/lib/utils";
import { CartItemRow } from "@/components/CartItemRow";
import { ShoppingBag, ArrowRight } from "lucide-react";

export default async function CartPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?message=Please+sign+in+to+view+your+bag");
  }

  const { items, subtotalCents, totalItems } = await getCart(user.id);

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-stone-100">
          <ShoppingBag className="h-8 w-8 text-stone-400" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-stone-900">
          Your shopping bag is empty
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          Discover our curated collection of essential apparel pieces.
        </p>
        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex items-center space-x-2 rounded-md bg-stone-900 px-6 py-3 text-sm font-medium text-white hover:bg-stone-800 transition-colors"
          >
            <span>Explore Collection</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
        Shopping Bag ({totalItems} {totalItems === 1 ? "piece" : "pieces"})
      </h1>

      <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-start">
        {/* Cart Items List */}
        <div className="lg:col-span-7">
          <div className="divide-y divide-stone-200/80 border-t border-stone-200/80">
            {items.map((item) => (
              <CartItemRow key={item.id} item={item} />
            ))}
          </div>
        </div>

        {/* Order Summary */}
        <div className="rounded-lg border border-stone-200/80 bg-white p-6 shadow-sm lg:col-span-5">
          <h2 className="text-base font-semibold text-stone-900 tracking-tight">
            Order Summary
          </h2>

          <dl className="mt-6 space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-stone-500">Subtotal</dt>
              <dd className="font-mono font-medium tabular-nums text-stone-900">
                {formatPrice(subtotalCents)}
              </dd>
            </div>

            <div className="flex items-center justify-between">
              <dt className="text-stone-500">Estimated Shipping</dt>
              <dd className="font-mono text-emerald-700 font-medium">Free</dd>
            </div>

            <div className="flex items-center justify-between border-t border-stone-200/80 pt-4 text-base font-semibold text-stone-900">
              <dt>Estimated Total</dt>
              <dd className="font-mono tabular-nums">
                {formatPrice(subtotalCents)}
              </dd>
            </div>
          </dl>

          <div className="mt-6">
            <Link
              href="/checkout"
              className="flex w-full items-center justify-center space-x-2 rounded-md bg-stone-900 py-3.5 text-sm font-medium tracking-wide text-white transition-colors hover:bg-stone-800 uppercase"
            >
              <span>Proceed to Checkout</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <p className="mt-4 text-center text-xs text-stone-400">
            1-Click Mock Instant Confirmation on checkout
          </p>
        </div>
      </div>
    </div>
  );
}
