"use client";

import { useMutationRequest } from "@/lib/use-mutation-request";

import React, { useState, useTransition } from "react";
import { addToCart } from "@/app/actions/cart.actions";
import { Loader2, Check, ShoppingBag } from "lucide-react";

interface AddToCartButtonProps {
  productId: string;
  inventoryCount: number;
}

export function AddToCartButton({
  productId,
  inventoryCount,
}: AddToCartButtonProps) {
  const mutation = useMutationRequest();
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const isSoldOut = inventoryCount <= 0;

  const handleAdd = () => {
    if (isSoldOut) return;
    setStatusMessage(null);
    setIsError(false);

    startTransition(async () => {
      const res = await addToCart(productId, 1, mutation.requestId("add", [productId, 1]));
      if (res.success) {
        mutation.complete("add");
        setStatusMessage("Added to bag");
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        setIsError(true);
        setStatusMessage(res.message);
      }
    });
  };

  if (isSoldOut) {
    return (
      <div className="space-y-2">
        <button
          disabled
          className="w-full cursor-not-allowed rounded-md bg-stone-200 py-3.5 text-center text-sm font-semibold tracking-wide text-stone-500 uppercase"
        >
          Sold Out
        </button>
        <p className="text-center font-mono text-xs text-stone-400">
          This piece is currently out of stock.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleAdd}
        disabled={isPending}
        className="flex w-full items-center justify-center space-x-2 rounded-md bg-stone-900 py-3.5 text-sm font-medium tracking-wide text-white transition-colors hover:bg-stone-800 disabled:opacity-50 uppercase"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Adding to Bag…</span>
          </>
        ) : (
          <>
            <ShoppingBag className="h-4 w-4" />
            <span>Add to Bag</span>
          </>
        )}
      </button>

      {statusMessage && (
        <div
          className={`flex items-center justify-center space-x-1.5 text-xs font-medium ${
            isError ? "text-red-600" : "text-emerald-700"
          }`}
        >
          {!isError && <Check className="h-3.5 w-3.5" />}
          <span>{statusMessage}</span>
        </div>
      )}
    </div>
  );
}
