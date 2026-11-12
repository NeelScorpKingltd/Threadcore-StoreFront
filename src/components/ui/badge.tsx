import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "amber" | "neutral";
}

function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-stone-400",
        {
          "border-transparent bg-stone-900 text-white shadow":
            variant === "default",
          "border-transparent bg-stone-100 text-stone-900":
            variant === "secondary",
          "border-transparent bg-red-500 text-white shadow":
            variant === "destructive",
          "border-stone-200 text-stone-900": variant === "outline",
          "border-amber-200 bg-amber-50 text-amber-900": variant === "amber",
          "border-stone-200 bg-stone-100 text-stone-600": variant === "neutral",
        },
        className
      )}
      {...props}
    />
  );
}

export { Badge };
