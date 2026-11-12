"use client";

import React, { useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { updateItemQuantity, removeItem } from "@/app/actions/cart.actions";
import { Trash2, Plus, Minus, Loader2 } from "lucide-react";

export interface CartItemRowProps {
  item: {
    id: string;
    productId: string;
    quantity: number;
    product: {
      title: string;
      sku: string;
      priceCents: number;
      inventoryCount: number;
      imageUrl: string;
    };
  };
}

export function CartItemRow({ item }: CartItemRowProps) {
  const [isPending, startTransition] = useTransition();

  const handleUpdate = (newQty: number) => {
    if (newQty < 1) {
      handleRemove();
      return;
    }
    startTransition(async () => {
      await updateItemQuantity(item.id, newQty);
    });
  };

  const handleRemove = () => {
    startTransition(async () => {
      await removeItem(item.id);
    });
  };

  const lineTotal = item.product.priceCents * item.quantity;
  const isMaxStock = item.quantity >= item.product.inventoryCount;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 border-b border-stone-200/80">
      {/* Product Image & Info */}
      <div className="flex items-center space-x-4">
        <div className="relative h-20 w-16 flex-shrink-0 overflow-hidden rounded bg-stone-100 border border-stone-200/80">
          <Image
            src={item.product.imageUrl}
            alt={item.product.title}
            fill
            className="object-cover object-center"
          />
        </div>

        <div className="flex flex-col space-y-1">
          <Link
            href={`/products/${item.productId}`}
            className="text-sm font-semibold text-stone-900 hover:underline"
          >
            {item.product.title}
          </Link>
          <span className="font-mono text-xs text-stone-400">
            {item.product.sku}
          </span>
          <span className="font-mono text-xs text-stone-600 tabular-nums">
            {formatPrice(item.product.priceCents)} each
          </span>
        </div>
      </div>

      {/* Quantity & Actions */}
      <div className="flex items-center justify-between sm:justify-end sm:space-x-8">
        <div className="flex items-center space-x-2">
          <div className="flex items-center rounded-md border border-stone-200 bg-white">
            <button
              onClick={() => handleUpdate(item.quantity - 1)}
              disabled={isPending || item.quantity <= 1}
              className="flex h-8 w-8 items-center justify-center text-stone-600 hover:text-stone-900 disabled:opacity-30"
              aria-label="Decrease quantity"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-8 text-center font-mono text-xs font-semibold tabular-nums text-stone-900">
              {item.quantity}
            </span>
            <button
              onClick={() => handleUpdate(item.quantity + 1)}
              disabled={isPending || isMaxStock}
              className="flex h-8 w-8 items-center justify-center text-stone-600 hover:text-stone-900 disabled:opacity-30"
              aria-label="Increase quantity"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            onClick={handleRemove}
            disabled={isPending}
            className="p-1.5 text-stone-400 hover:text-red-600 disabled:opacity-50 transition-colors"
            title="Remove item"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin text-stone-600" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        </div>

        <div className="text-right">
          <span className="font-mono text-sm font-medium tabular-nums text-stone-900">
            {formatPrice(lineTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}
