import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive" | "glass";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={twMerge(
          clsx(
            "inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]",
            {
              // Variants
              "bg-primary text-primary-foreground hover:bg-primary/95 focus:ring-primary shadow-sm shadow-primary/20":
                variant === "default",
              "bg-secondary text-secondary-foreground hover:bg-secondary/80 focus:ring-secondary":
                variant === "secondary",
              "border border-border bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground focus:ring-primary":
                variant === "outline",
              "bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground focus:ring-primary":
                variant === "ghost",
              "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive shadow-sm":
                variant === "destructive",
              "glass-card border-none hover:bg-primary/10 text-foreground hover:text-primary focus:ring-primary":
                variant === "glass",

              // Sizes
              "px-3 py-1.5 text-xs": size === "sm",
              "px-4 py-2 text-sm": size === "md",
              "px-5 py-2.5 text-base": size === "lg",
              "p-2 w-9 h-9": size === "icon",
            },
            className
          )
        )}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
