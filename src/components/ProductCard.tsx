import React from "react";
import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { QuickAddControl } from "@/components/QuickAddControl";

export interface ProductCardProps {
  product: {
    id: string;
    sku: string;
    title: string;
    description: string;
    category: string;
    priceCents: number;
    inventoryCount: number;
    imageUrl: string;
  };
}

export function ProductCard({ product }: ProductCardProps) {
  const isSoldOut = product.inventoryCount === 0;
  const isLowStock = product.inventoryCount > 0 && product.inventoryCount <= 6;

  return (
    <div className="group flex flex-col space-y-3">
      {/* 3:4 Portrait Image Container */}
      <Link
        href={`/products/${product.id}`}
        className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-stone-100 border border-stone-200/60 shadow-xs"
      >
        <Image
          src={product.imageUrl}
          alt={product.title}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          className="object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        />

        {/* Stock Status Badges */}
        <div className="absolute left-3 top-3 z-10">
          {isSoldOut ? (
            <span className="inline-flex items-center rounded-sm bg-stone-900/90 px-2 py-0.5 text-[10px] font-medium tracking-widest text-white uppercase backdrop-blur-xs shadow-xs">
              Sold Out
            </span>
          ) : isLowStock ? (
            <span className="inline-flex items-center rounded-sm border border-amber-200/90 bg-amber-50/90 px-2 py-0.5 text-[10px] font-medium tracking-wider text-amber-900 backdrop-blur-xs shadow-xs">
              Low Stock · {product.inventoryCount} left
            </span>
          ) : null}
        </div>
      </Link>

      {/* Product Information (No SKU - reserved for product detail page) */}
      <div className="flex flex-col space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-medium">
            {product.category}
          </span>
        </div>

        <Link
          href={`/products/${product.id}`}
          className="text-sm font-medium tracking-tight text-stone-900 hover:text-stone-600 transition-colors line-clamp-1"
        >
          {product.title}
        </Link>

        <p className="font-mono text-sm font-medium tabular-nums text-stone-900">
          {formatPrice(product.priceCents)}
        </p>
      </div>

      {/* Quick Add To Bag & Quantity Controller */}
      <QuickAddControl
        productId={product.id}
        inventoryCount={product.inventoryCount}
        productTitle={product.title}
      />
    </div>
  );
}
