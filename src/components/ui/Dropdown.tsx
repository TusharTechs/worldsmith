'use client';

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
  icon?: ReactNode;
}

/**
 * Custom-styled dropdown — replaces the native <select>, which renders with the OS's default
 * picker UI and can't be themed. Click-to-toggle, click-outside-to-close, matches the app's
 * dark/gradient visual language instead of looking like a stock browser control.
 */
export function Dropdown<T extends string>({
  value, onChange, options, className = "",
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly DropdownOption<T>[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 bg-zinc-950 border rounded-lg px-3 py-2 text-xs text-left transition-colors ${
          open ? "border-cyan-700" : "border-zinc-800 hover:border-zinc-600"
        }`}
      >
        {current?.icon}
        <span className="text-zinc-200">{current?.label ?? value}</span>
        {current?.hint && <span className="text-zinc-500 font-mono">{current.hint}</span>}
        <ChevronDown size={14} className={`ml-auto text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 min-w-full w-max max-w-xs bg-zinc-900 border border-zinc-700 rounded-xl p-1.5 shadow-2xl fade-in">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs transition-colors ${
                o.value === value ? "bg-gradient-to-r from-cyan-950/50 to-fuchsia-950/50 text-white" : "text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {o.icon}
              <span className="flex-1">{o.label}</span>
              {o.hint && <span className="text-zinc-500 font-mono shrink-0">{o.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
