import React from "react";
import { cn } from "@/lib/utils";

interface OrderStatusBadgeProps {
  status: "CONFIRMED" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED" | string;
  className?: string;
}

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  const getStyles = () => {
    switch (status) {
      case "CONFIRMED":
        return "bg-stone-900 text-white border-transparent";
      case "PROCESSING":
        return "bg-amber-50 text-amber-900 border-amber-200";
      case "SHIPPED":
        return "bg-blue-50 text-blue-900 border-blue-200";
      case "DELIVERED":
        return "bg-emerald-50 text-emerald-900 border-emerald-200";
      case "CANCELLED":
        return "bg-stone-100 text-stone-500 border-stone-200 line-through";
      default:
        return "bg-stone-100 text-stone-700 border-stone-200";
    }
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-medium border uppercase tracking-wider",
        getStyles(),
        className
      )}
    >
      {status}
    </span>
  );
}
