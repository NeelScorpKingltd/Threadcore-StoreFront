"use client";

import { useMutationRequest } from "@/lib/use-mutation-request";

import React, { useState, useTransition } from "react";
import { addToCart } from "@/app/actions/cart.actions";
import { Plus, Minus, Loader2, Check } from "lucide-react";

interface QuickAddControlProps {
  productId: string;
  inventoryCount: number;
  productTitle: string;
}

export function QuickAddControl({
  productId,
  inventoryCount,
}: QuickAddControlProps) {
  const mutation = useMutationRequest();
  const [quantity, setQuantity] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  const isSoldOut = inventoryCount <= 0;

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isSoldOut || isPending) return;

    startTransition(async () => {
      const res = await addToCart(productId, quantity, mutation.requestId("add", [productId, quantity]));
      if (res.success) {
        mutation.complete("add");
        setFeedback("Added");
        setTimeout(() => setFeedback(null), 2000);
      } else {
        setFeedback("Error");
        setTimeout(() => setFeedback(null), 2500);
      }
    });
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (quantity < Math.min(inventoryCount, 99)) {
      setQuantity((q) => q + 1);
    }
  };

  const handleDecrement = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (quantity > 1) {
      setQuantity((q) => q - 1);
    }
  };

  if (isSoldOut) {
    return (
      <div
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className="w-full rounded bg-stone-100 py-2 text-center font-mono text-[11px] font-medium tracking-widest text-stone-400 uppercase"
      >
        Sold Out
      </div>
    );
  }

  return (
    <div
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="flex items-center space-x-1.5 w-full pt-1"
    >
      {/* Quantity Stepper */}
      <div className="flex items-center rounded border border-stone-200/80 bg-white/90 backdrop-blur-sm shadow-xs">
        <button
          type="button"
          onClick={handleDecrement}
          disabled={quantity <= 1 || isPending}
          className="flex h-7 w-6 items-center justify-center text-stone-500 hover:text-stone-900 disabled:opacity-30 transition-colors"
          aria-label="Decrease quantity"
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="w-5 text-center font-mono text-xs font-semibold tabular-nums text-stone-800">
          {quantity}
        </span>
        <button
          type="button"
          onClick={handleIncrement}
          disabled={quantity >= Math.min(inventoryCount, 99) || isPending}
          className="flex h-7 w-6 items-center justify-center text-stone-500 hover:text-stone-900 disabled:opacity-30 transition-colors"
          aria-label="Increase quantity"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Quick Add CTA */}
      <button
        type="button"
        onClick={handleQuickAdd}
        disabled={isPending}
        className="flex-1 flex items-center justify-center space-x-1 h-7 rounded bg-stone-900 px-2.5 text-[11px] font-medium tracking-wider text-white transition-all hover:bg-stone-800 active:bg-black disabled:opacity-50 uppercase shadow-xs"
      >
        {isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : feedback ? (
          <>
            <Check className="h-3 w-3 text-emerald-400" />
            <span className="text-emerald-300 font-semibold">{feedback}</span>
          </>
        ) : (
          <span>Add to Bag</span>
        )}
      </button>
    </div>
  );
}
