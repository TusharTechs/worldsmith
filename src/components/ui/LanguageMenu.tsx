'use client';

import { useEffect, useRef, useState } from "react";
import { Globe, Check, ChevronDown } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { LANGUAGES } from "@/i18n/languages";

/** Compact globe icon + dropdown — the standalone language switcher shown when signed out. */
export function LanguageMenu({ compact = true }: { compact?: boolean }) {
  const { locale, setLocale } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LANGUAGES.find((l) => l.code === locale) ?? LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDocClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
        aria-label="Change language"
      >
        <Globe size={14} />
        {!compact && <span className="text-xs">{current.label}</span>}
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-48 max-h-72 overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-xl p-1.5 shadow-2xl z-50 fade-in">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => { setLocale(l.code); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition-colors ${
                l.code === locale ? "bg-gradient-to-r from-cyan-950/50 to-fuchsia-950/50 text-white" : "text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {l.label}
              {l.code === locale && <Check size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
