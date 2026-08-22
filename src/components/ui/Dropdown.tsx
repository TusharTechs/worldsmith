'use client';

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
  icon?: ReactNode;
  /** Renders this option's label in its own typeface — a font picker should show the fonts. */
  fontFamily?: string;
}

/**
 * Custom-styled dropdown — replaces the native <select>, which renders with the OS's default
 * picker UI and can't be themed. Click-to-toggle, click-outside-to-close, matches the app's
 * dark/gradient visual language instead of looking like a stock browser control.
 */
export function Dropdown<T extends string>({
  value, onChange, options, className = "", full = false, ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly DropdownOption<T>[];
  className?: string;
  /** Fill the container rather than sizing to content — for use as a form field. */
  full?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);


  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); return; }
      // Matching the native control: arrows move, Enter and Space commit.
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(options.length - 1, i + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
      else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const o = options[active];
        if (o) { onChange(o.value); setOpen(false); }
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, active, options, onChange]);

  return (
    <div ref={ref} className={`relative ${full ? "block" : "inline-block"} ${className}`}>
      <button
        type="button"
        onClick={() => {
          // Start keyboard navigation on the current value rather than syncing it from an effect.
          if (!open) setActive(Math.max(0, options.findIndex((o) => o.value === value)));
          setOpen((v) => !v);
        }}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-2 bg-zinc-950 border rounded-lg px-3 py-2 text-xs text-left transition-colors ${full ? "w-full" : ""} ${
          open ? "border-cyan-700" : "border-zinc-800 hover:border-zinc-600"
        }`}
      >
        {current?.icon}
        <span className="truncate text-zinc-200" style={current?.fontFamily ? { fontFamily: current.fontFamily } : undefined}>{current?.label ?? value}</span>
        {current?.hint && <span className="text-zinc-500 font-mono">{current.hint}</span>}
        <ChevronDown size={14} className={`ml-auto text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div role="listbox" className={`absolute z-50 mt-1.5 max-h-64 overflow-auto bg-zinc-900 border border-zinc-700 rounded-xl p-1.5 shadow-2xl fade-in ${full ? "w-full" : "min-w-full w-max max-w-xs"}`}>
          {options.map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => setActive(i)}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs transition-colors ${
                o.value === value ? "bg-gradient-to-r from-cyan-950/50 to-fuchsia-950/50 text-white"
                  : i === active ? "bg-zinc-800 text-white" : "text-zinc-300"
              }`}
            >
              {o.icon}
              <span className="flex-1 truncate" style={o.fontFamily ? { fontFamily: o.fontFamily } : undefined}>{o.label}</span>
              {o.hint && <span className="text-zinc-500 font-mono shrink-0">{o.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
