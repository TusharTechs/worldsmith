'use client';

import { CornerDownLeft } from "lucide-react";
import type { SizeExample } from "@/app/tools/examples";

/**
 * Every size this platform advertises, shown at its real aspect with a real image behind it.
 *
 * The nav menus promise exact pixel dimensions per platform. This is the receipt: each tile was
 * generated at the size printed on it and the file was checked to be that size. Tiles keep their
 * true aspect ratio rather than being squared off, so a 1128×191 banner reads as a banner and a
 * 1000×2100 pin reads as a pin — the shape is the information.
 */
export function SizeShowcase({
  platform, examples, activeFormat, onUse,
}: {
  platform: string;
  examples: SizeExample[];
  activeFormat?: string | null;
  onUse?: (prompt: string, width: number, height: number) => void;
}) {
  if (examples.length === 0) return null;

  // One tile per format. Formats now carry several examples each so the canvas above can show
  // variations, but this section's job is the size catalogue — three identical "Thumbnail
  // 1280×720" cards would pad it without adding information (and duplicated React keys).
  const perFormat = examples.filter(
    (e, i) => examples.findIndex((o) => o.format === e.format && o.width === e.width && o.height === e.height) === i
  );

  return (
    <section className="mt-16">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
          Every {platform} size, generated at exact pixels
        </h2>
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-700">
          Real output · verified dimensions
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {perFormat.map((ex) => {
          const active = activeFormat && ex.format.toLowerCase() === activeFormat.toLowerCase();
          return (
            <figure
              key={ex.uri}
              className={`group overflow-hidden rounded-xl border transition-colors ${
                active ? "border-cyan-500/50 bg-cyan-500/[0.05]" : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.16]"
              }`}
            >
              {/* The frame carries the true ratio, so the tile itself communicates the shape. */}
              <div
                className="relative w-full overflow-hidden bg-black"
                style={{ aspectRatio: `${ex.width} / ${ex.height}`, maxHeight: 260 }}
              >
                {ex.kind === "video" ? (
                  <video
                    src={ex.uri}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget;
                      if (v.duration > 1.2) v.currentTime = 1;   // skip the fade-up from black
                    }}
                    onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 1; }}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <img
                    src={ex.uri}
                    alt={`${ex.format} — ${ex.width}×${ex.height}`}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
              </div>

              <figcaption className="flex items-center justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium text-zinc-200">{ex.format}</p>
                  <p className="text-[10px] font-mono tabular-nums text-zinc-600">
                    {ex.width}×{ex.height}
                  </p>
                </div>
                {onUse && (
                  <button
                    onClick={() => onUse(ex.prompt, ex.width, ex.height)}
                    title="Load this prompt and size"
                    className="shrink-0 rounded-md border border-white/[0.09] px-2 py-1 text-[9px] font-mono uppercase tracking-widest text-zinc-500 transition-colors hover:border-cyan-500/40 hover:text-cyan-300"
                  >
                    <CornerDownLeft size={9} className="mr-1 inline" />
                    Use
                  </button>
                )}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </section>
  );
}
