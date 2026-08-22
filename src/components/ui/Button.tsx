'use client';

import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "gradient" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-white text-black hover:bg-zinc-200",
  gradient: "ws-gradient-bg text-black hover:brightness-110",
  outline: "border border-zinc-700 text-zinc-200 hover:border-zinc-500 hover:text-white",
  ghost: "text-zinc-400 hover:text-white hover:bg-zinc-900",
  danger: "border border-red-900 text-red-400 hover:bg-red-950/30",
};

const SIZE: Record<Size, string> = {
  sm: "px-3 py-1.5 text-[10px]",
  md: "px-5 py-2.5 text-xs",
  lg: "px-8 py-4 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  loadingText?: string;
}

/** Shared button primitive — every page previously hand-rolled these class strings inline. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, loadingText, disabled, className = "", children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={[
        "inline-flex items-center justify-center gap-2 rounded font-semibold uppercase tracking-widest transition-all",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        VARIANT[variant],
        SIZE[size],
        className,
      ].join(" ")}
      {...rest}
    >
      {loading && (
        <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
      )}
      {loading && loadingText ? loadingText : children}
    </button>
  );
});
