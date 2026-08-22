import { HTMLAttributes, ReactNode } from "react";

type Tone = "neutral" | "success" | "warning" | "info" | "accent" | "danger";

const RING: Record<Tone, string> = {
  neutral: "border-zinc-800",
  success: "border-emerald-900/50",
  warning: "border-amber-900/50",
  info: "border-cyan-900/50",
  accent: "border-fuchsia-900/50",
  danger: "border-red-900/50",
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  glass?: boolean;
  children: ReactNode;
}

/** Shared card surface — bg-zinc-900/50 + border, the single most repeated pattern in the app. */
export function Card({ tone = "neutral", glass = true, className = "", children, ...rest }: CardProps) {
  return (
    <div
      className={[
        "rounded-xl p-6 border",
        glass ? "bg-zinc-900/50 backdrop-blur-sm" : "bg-zinc-900",
        RING[tone],
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardLabel({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" }) {
  return (
    <h3 className={`text-xs uppercase tracking-widest ${tone === "accent" ? "ws-gradient-text" : "text-zinc-500"}`}>
      {children}
    </h3>
  );
}
