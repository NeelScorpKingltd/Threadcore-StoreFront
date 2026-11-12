import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-400 disabled:pointer-events-none disabled:opacity-50 select-none",
          {
            "bg-stone-900 text-white shadow hover:bg-stone-800 active:bg-stone-950":
              variant === "default",
            "border border-stone-200/80 bg-white text-stone-900 shadow-sm hover:bg-stone-100/80 hover:text-stone-900":
              variant === "outline",
            "hover:bg-stone-100 text-stone-700 hover:text-stone-900":
              variant === "ghost",
            "bg-red-600 text-white shadow-sm hover:bg-red-700":
              variant === "destructive",
            "bg-stone-100 text-stone-900 shadow-sm hover:bg-stone-200":
              variant === "secondary",
          },
          {
            "h-10 px-4 py-2": size === "default",
            "h-8 rounded-md px-3 text-xs": size === "sm",
            "h-12 rounded-md px-8 text-base": size === "lg",
            "h-9 w-9 p-0": size === "icon",
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
