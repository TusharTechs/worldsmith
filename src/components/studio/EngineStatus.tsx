'use client';

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

export interface EngineModes {
  llm: string;
  research: string;
  image: string;
  video: string;
  vlm: string;
  dist: string;
  audio: string;
  persistence?: string;
}

const LIVE = /^(VERTEX|GEMINI|VEO|PARALLEL|FIRESTORE)$/i;
const isLive = (v?: string) => !!v && LIVE.test(v);

/**
 * The provider stack, collapsed.
 *
 * This used to be eight badges wrapping across two rows above the fold — real information
 * (every model here is a Google model, and research is Parallel) presented as debug output.
 * The summary keeps the three names that carry the claim; the popover keeps the full audit
 * trail one click away for anyone who wants to verify it.
 */
export function EngineStatus({ modes }: { modes: EngineModes }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const rows: { label: string; value: string }[] = [
    { label: t("studio.engine.reasoning"), value: modes.llm },
    { label: t("studio.engine.research"), value: modes.research },
    { label: t("studio.engine.image"), value: modes.image },
    { label: t("studio.engine.video"), value: modes.video },
    { label: t("studio.engine.qc"), value: modes.vlm },
    { label: t("studio.engine.distribution"), value: modes.dist },
    { label: t("studio.engine.narration"), value: modes.audio },
    ...(modes.persistence ? [{ label: t("studio.engine.storage"), value: modes.persistence }] : []),
  ];

  const liveCount = rows.filter((r) => isLive(r.value)).length;
  const allLive = liveCount === rows.length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex items-center gap-2 h-8 pl-2.5 pr-2 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 transition-colors"
      >
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          {allLive && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70 animate-ping" />}
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${allLive ? "bg-emerald-400" : "bg-amber-400"}`} />
        </span>
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 group-hover:text-zinc-200 whitespace-nowrap">
          {allLive ? "Vertex · Veo · Parallel" : t("studio.engine.live", { n: String(liveCount), m: String(rows.length) })}
        </span>
        <ChevronDown size={12} className={`text-zinc-600 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-72 rounded-xl border border-zinc-800 bg-zinc-900 p-3 shadow-2xl fade-in">
          <p className="px-1 pb-2 text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("studio.engine.title")}</p>
          <div className="space-y-0.5">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-3 rounded-md px-1 py-1.5">
                <span className="text-xs text-zinc-400">{r.label}</span>
                <span className={`flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest ${isLive(r.value) ? "text-emerald-400" : "text-amber-400"}`}>
                  <span className={`h-1 w-1 rounded-full ${isLive(r.value) ? "bg-emerald-400" : "bg-amber-400"}`} />
                  {r.value}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 border-t border-zinc-800 px-1 pt-2 text-[10px] leading-relaxed text-zinc-500">
            {t("studio.engine.note")}
          </p>
        </div>
      )}
    </div>
  );
}
