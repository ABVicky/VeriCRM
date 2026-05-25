import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | "default"
    | "secondary"
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "purple";
  pulse?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = "default",
  pulse = false,
  children,
  ...props
}) => {
  return (
    <span
      className={twMerge(
        clsx(
          "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide transition-all shadow-sm border",
          {
            "bg-primary/10 border-primary/20 text-primary": variant === "default",
            "bg-secondary border-border text-secondary-foreground": variant === "secondary",
            "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400":
              variant === "success",
            "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400":
              variant === "warning",
            "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400":
              variant === "danger",
            "bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-400":
              variant === "info",
            "bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400":
              variant === "purple",
          },
          className
        )
      )}
      {...props}
    >
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span
            className={clsx(
              "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
              {
                "bg-primary": variant === "default",
                "bg-muted": variant === "secondary",
                "bg-emerald-500": variant === "success",
                "bg-amber-500": variant === "warning",
                "bg-rose-500": variant === "danger",
                "bg-sky-500": variant === "info",
                "bg-indigo-500": variant === "purple",
              }
            )}
          />
          <span
            className={clsx("relative inline-flex rounded-full h-1.5 w-1.5", {
              "bg-primary": variant === "default",
              "bg-muted": variant === "secondary",
              "bg-emerald-500": variant === "success",
              "bg-amber-500": variant === "warning",
              "bg-rose-500": variant === "danger",
              "bg-sky-500": variant === "info",
              "bg-indigo-500": variant === "purple",
            })}
          />
        </span>
      )}
      {children}
    </span>
  );
};
