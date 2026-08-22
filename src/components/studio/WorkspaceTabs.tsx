'use client';

import type { LucideIcon } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

export interface WorkTab {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Rendered as a small count/dot next to the label; hidden when undefined. */
  badge?: number;
  /** Tabs with nothing in them yet stay visible but unreachable, so the shape of the work is legible. */
  enabled: boolean;
}

/**
 * A finished production used to be fourteen sections stacked into one endless scroll. The work
 * has natural phases, so the canvas splits along them — and a disabled tab still tells you what
 * is coming, which a hidden one cannot.
 */
export function WorkspaceTabs({
  tabs, active, onChange,
}: {
  tabs: WorkTab[]; active: string; onChange: (id: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="sticky top-0 z-30 -mx-5 mb-6 border-b border-white/[0.07] bg-zinc-950/85 px-5 backdrop-blur-xl">
      <div role="tablist" aria-label={t("studio.tabs.label")} className="flex gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const on = active === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              disabled={!t.enabled}
              onClick={() => onChange(t.id)}
              className={`relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-3 text-[11px] font-mono uppercase tracking-widest transition-colors ${
                on
                  ? "text-white"
                  : t.enabled
                    ? "text-zinc-500 hover:text-zinc-300"
                    : "cursor-not-allowed text-zinc-700/70"
              }`}
            >
              <t.icon size={13} className="shrink-0" />
              {t.label}
              {t.badge != null && t.badge > 0 && (
                <span className={`rounded-full px-1.5 py-px text-[9px] tabular-nums ${on ? "bg-white/15 text-white" : "bg-white/[0.06] text-zinc-500"}`}>
                  {t.badge}
                </span>
              )}
              {on && <span className="absolute inset-x-2 -bottom-px h-px bg-gradient-to-r from-cyan-400 to-fuchsia-500" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
