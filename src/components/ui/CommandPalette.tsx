'use client';

import { useEffect, useRef, useState } from "react";

interface Command {
  label: string;
  hint?: string;
  href: string;
  group: string;
}

const COMMANDS: Command[] = [
  { label: "Studio — full production", hint: "research → world → storyboard → film", href: "/studio", group: "Go to" },
  { label: "Home", href: "/", group: "Go to" },
  { label: "Pricing", href: "/#pricing", group: "Go to" },
  { label: "Text → Image", hint: "5 cr", href: "/tools?tool=t2i", group: "Toolbox" },
  { label: "Text → Video", hint: "40 cr/sec", href: "/tools?tool=t2v", group: "Toolbox" },
  { label: "Image → Video", hint: "40 cr/sec", href: "/tools?tool=i2v", group: "Toolbox" },
  { label: "Voiceover + Images → Video", hint: "40/sec +2", href: "/tools?tool=flow", group: "Toolbox" },
  { label: "Text → Speech", hint: "2 cr", href: "/tools?tool=tts", group: "Toolbox" },
  { label: "Image → Prompt", hint: "1 cr", href: "/tools?tool=i2p", group: "Toolbox" },
  { label: "Upscale Image", hint: "3 cr", href: "/tools?tool=upscale", group: "Toolbox" },
  { label: "Social Post", hint: "6 cr", href: "/tools?tool=social", group: "Toolbox" },
  { label: "YouTube Kit", hint: "40/sec +5", href: "/tools?tool=ytkit", group: "Toolbox" },
  { label: "Cast — character consistency", hint: "5 cr", href: "/tools?tool=cast", group: "Toolbox" },
  { label: "Creative Text Editor", hint: "free", href: "/tools?tool=text", group: "Toolbox" },
];

/**
 * Global ⌘K / Ctrl+K switcher. Uses a hard navigation (not client-side router push) so the
 * Toolbox's own "read ?tool= on mount" effect always re-runs, even when jumping tool→tool.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const filtered = COMMANDS.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));

  const go = (href: string) => {
    setOpen(false);
    window.location.href = href;
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 text-[10px] font-mono uppercase tracking-widest transition-colors"
      >
        Jump to <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-400">⌘K</kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-start justify-center pt-[15vh] p-6" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden fade-in shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === "Enter" && filtered[active]) go(filtered[active].href);
          }}
          placeholder="Jump to a tool or page..."
          className="w-full bg-transparent px-5 py-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none border-b border-zinc-800"
        />
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="text-xs text-zinc-600 font-mono p-3">No matches.</p>
          )}
          {filtered.map((c, i) => (
            <button
              key={c.href}
              onClick={() => go(c.href)}
              onMouseEnter={() => setActive(i)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                active === i ? "bg-cyan-950/40 text-white" : "text-zinc-300"
              }`}
            >
              <span>{c.label}</span>
              {c.hint && <span className="text-[10px] font-mono text-zinc-500">{c.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
