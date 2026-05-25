import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-verde-primary text-white hover:bg-verde-accent disabled:opacity-60",
  secondary:
    "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60",
  ghost: "text-gray-700 hover:bg-gray-100 disabled:opacity-60",
  danger: "bg-red-alert text-white hover:bg-red-700 disabled:opacity-60",
};

export function Button({
  variant = "primary",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "px-4 py-2 rounded-lg text-sm font-medium transition",
        VARIANT[variant],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
