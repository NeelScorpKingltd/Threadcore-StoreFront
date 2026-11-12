import React from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductById } from "@/services/catalog.service";
import { formatPrice } from "@/lib/utils";
import { AddToCartButton } from "@/components/AddToCartButton";
import { ArrowLeft, ShieldCheck, Truck, RefreshCcw } from "lucide-react";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProductById(id);

  if (!product) {
    notFound();
  }

  const isSoldOut = product.inventoryCount === 0;
  const isLowStock = product.inventoryCount > 0 && product.inventoryCount <= 6;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Back link */}
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center space-x-2 text-xs font-medium text-stone-500 hover:text-stone-900 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Collection</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Product Image */}
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-stone-100 border border-stone-200/80 shadow-sm">
          <Image
            src={product.imageUrl}
            alt={product.title}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover object-center"
          />

          {/* Badges */}
          <div className="absolute left-4 top-4 z-10">
            {isSoldOut ? (
              <span className="inline-flex items-center rounded bg-stone-900 px-2.5 py-1 text-xs font-medium tracking-wide text-white uppercase shadow-sm">
                Sold Out
              </span>
            ) : isLowStock ? (
              <span className="inline-flex items-center rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium tracking-wide text-amber-900 shadow-sm">
                Low Stock · Only {product.inventoryCount} remaining
              </span>
            ) : null}
          </div>
        </div>

        {/* Product Details & Actions */}
        <div className="flex flex-col justify-between space-y-8">
          <div className="space-y-6">
            <div className="space-y-1.5 border-b border-stone-200/80 pb-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-widest text-stone-500">
                  {product.category}
                </span>
                <span className="font-mono text-xs text-stone-400">
                  SKU: {product.sku}
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
                {product.title}
              </h1>
              <p className="font-mono text-xl font-semibold tabular-nums text-stone-900 pt-2">
                {formatPrice(product.priceCents)}
              </p>
            </div>

            {/* Description */}
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-900">
                Design & Specifications
              </h2>
              <p className="text-sm leading-relaxed text-stone-600">
                {product.description}
              </p>
            </div>

            {/* In Stock status indicator */}
            <div className="flex items-center space-x-2 text-xs">
              <span
                className={`h-2 w-2 rounded-full ${
                  isSoldOut
                    ? "bg-red-500"
                    : isLowStock
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
              />
              <span className="font-mono text-stone-600">
                {isSoldOut
                  ? "Out of Stock"
                  : `${product.inventoryCount} units available in archive`}
              </span>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="space-y-6 border-t border-stone-200/80 pt-6">
            <AddToCartButton
              productId={product.id}
              inventoryCount={product.inventoryCount}
            />

            {/* Value Props */}
            <div className="grid grid-cols-3 gap-4 border-t border-stone-200/80 pt-6 text-center">
              <div className="space-y-1">
                <Truck className="mx-auto h-4 w-4 text-stone-500" />
                <p className="text-[11px] font-medium text-stone-700">
                  Complimentary Shipping
                </p>
              </div>
              <div className="space-y-1">
                <ShieldCheck className="mx-auto h-4 w-4 text-stone-500" />
                <p className="text-[11px] font-medium text-stone-700">
                  Ethically Sourced
                </p>
              </div>
              <div className="space-y-1">
                <RefreshCcw className="mx-auto h-4 w-4 text-stone-500" />
                <p className="text-[11px] font-medium text-stone-700">
                  Instant Self-Cancel
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
