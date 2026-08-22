import { ReactNode } from "react";

type Tone = "neutral" | "success" | "warning" | "info" | "accent" | "danger";

const TONE: Record<Tone, string> = {
  neutral: "border-zinc-700 text-zinc-400 bg-zinc-900",
  success: "border-emerald-800 text-emerald-400 bg-emerald-950/30",
  warning: "border-amber-800 text-amber-400 bg-amber-950/30",
  info: "border-cyan-800 text-cyan-300 bg-cyan-950/30",
  accent: "border-fuchsia-800 text-fuchsia-300 bg-fuchsia-950/30",
  danger: "border-red-900 text-red-400 bg-red-950/30",
};

export function Badge({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded border uppercase tracking-widest ${TONE[tone]} ${className}`}>
      {children}
    </span>
  );
}

/** A live-status dot version, for provider/mode badges (pulses to read as "connected"). */
export function StatusBadge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const dot: Record<Tone, string> = {
    neutral: "bg-zinc-500",
    success: "bg-emerald-400",
    warning: "bg-amber-400",
    info: "bg-cyan-400",
    accent: "bg-fuchsia-400",
    danger: "bg-red-400",
  };
  return (
    <Badge tone={tone}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot[tone]}`} />
      {children}
    </Badge>
  );
}
