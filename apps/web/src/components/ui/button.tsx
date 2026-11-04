import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "default" | "icon";
};

export function Button({
  className,
  variant = "secondary",
  size = "default",
  ...props
}: ButtonProps) {
  const variants = {
    primary:
      "border-brand bg-brand text-white hover:bg-brand-hover hover:border-brand-hover",
    secondary: "border-border bg-white text-foreground hover:bg-surface-muted",
    ghost:
      "border-transparent bg-transparent text-muted hover:bg-surface-muted hover:text-foreground",
  };
  return (
    <button
      className={cn(
        "inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        size === "icon" && "size-9 p-0",
        className,
      )}
      {...props}
    />
  );
}
