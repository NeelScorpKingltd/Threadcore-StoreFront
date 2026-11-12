"use client";

import React, { useState, useTransition } from "react";
import { cancelOrder } from "@/app/actions/order.actions";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

interface CancelOrderButtonProps {
  orderId: string;
  orderNumber: string;
}

export function CancelOrderButton({
  orderId,
  orderNumber,
}: CancelOrderButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("Changed mind / ordered by mistake");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleCancel = () => {
    setError(null);
    startTransition(async () => {
      const res = await cancelOrder(orderId, reason);
      if (res.success) {
        setSuccess(true);
        setIsOpen(false);
      } else {
        setError(res.message ?? "Could not cancel order.");
      }
    });
  };

  if (success) {
    return (
      <div className="flex items-center space-x-2 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        <CheckCircle2 className="h-4 w-4" />
        <span>Order {orderNumber} has been cancelled. Inventory has been restored.</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!isOpen ? (
        <Button
          variant="outline"
          onClick={() => setIsOpen(true)}
          className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          Cancel Order & Restore Stock
        </Button>
      ) : (
        <div className="rounded-lg border border-red-200 bg-red-50/50 p-5 space-y-4">
          <div className="flex items-center space-x-2 text-sm font-semibold text-red-900">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span>Confirm Order Cancellation</span>
          </div>

          <p className="text-xs text-stone-600">
            Cancelling this order will immediately restock all ordered pieces in
            the live inventory.
          </p>

          <div className="space-y-1.5">
            <label
              htmlFor="cancellation-reason"
              className="text-xs font-medium text-stone-700"
            >
              Reason for cancellation
            </label>
            <input
              id="cancellation-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-400"
              placeholder="e.g. Changed size, accidental purchase"
            />
          </div>

          {error && (
            <p className="text-xs font-medium text-red-600">{error}</p>
          )}

          <div className="flex items-center space-x-3">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleCancel}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  <span>Restoring Stock…</span>
                </>
              ) : (
                "Yes, Cancel Order"
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              disabled={isPending}
            >
              Keep Order
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
