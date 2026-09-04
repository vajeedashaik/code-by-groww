import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type Variant = "clay" | "ghost" | "danger" | "outline";
type Size = "sm" | "md";

const VARIANT_CLASSES: Record<Variant, string> = {
  clay: "clay-pulse text-black font-semibold hover:brightness-105 active:translate-y-px",
  ghost: "glass text-white/90 hover:bg-white/10 active:translate-y-px",
  danger: "bg-down/90 text-white shadow-[0_10px_24px_-8px_rgba(255,92,92,0.55)] hover:brightness-105 active:translate-y-px",
  outline: "border border-white/15 text-white/80 hover:border-white/30 hover:text-white",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs rounded-full",
  md: "px-5 py-2.5 text-sm rounded-full",
};

const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(({ className, variant = "clay", size = "md", ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-all duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    />
  );
});
Button.displayName = "Button";

export default Button;
