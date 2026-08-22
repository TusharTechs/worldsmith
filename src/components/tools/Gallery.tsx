'use client';

import { useState } from "react";
import { CornerDownLeft, Play, Quote } from "lucide-react";
import { BeforeAfter } from "./BeforeAfter";
import type { ToolExample } from "@/app/tools/examples";

/**
 * Proof, not claims.
 *
 * A tool page's job below the fold used to be three cards asserting the output was studio-grade.
 * Showing the output does that better — and because every example carries the prompt that made
 * it, the gallery doubles as the fastest way to learn the tool: click one, the brief lands in the
 * field, run it, then start editing. That is the loop that brings people back.
 */
/** Every tile honours this, whichever branch renders it. */
const CAP = (compact: boolean) => (compact ? 340 : 420);

export function Gallery({
  examples,
  onUsePrompt,
  heading = "Made with this tool",
  compact = false,
}: {
  examples: ToolExample[];
  onUsePrompt?: (prompt: string) => void;
  heading?: string;
  compact?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  if (examples.length === 0) return null;

  // Tailwind's gap-2.5 in pixels, needed to size each row's bound.
  const GAP = 10;
  const mediaRow = !examples.some((e) => e.kind === "compare" || e.kind === "text");
  const rows = mediaRow ? chunkRows(examples, compact ? 3 : 3) : [examples];

  return (
    <section className={compact ? "" : "mt-16"}>
      {!compact && (
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">{heading}</h2>
          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-700">
            Real output · click to use the prompt
          </span>
        </div>
      )}
      {/* A justified row, not a grid of equal columns.
          Equal columns only look right when every example is the same shape. Once tiles carry
          their true dimensions, a 16:9 still beside a 1:1 and a 4:5 gave three different heights
          in one row, which reads as broken sizing.

          So widths are shared out in proportion to each tile's aspect (flex-grow = aspect, basis
          0). Every tile then resolves to the same height whatever mix of shapes is in the row, and
          the row always fills its canvas exactly. Height is *derived* from the available width
          rather than fixed — fixing it made two 16:9 clips 747px wide each, which overflowed and
          wrapped. To honour the height cap the container is bounded instead: at the widest, the
          row is exactly CAP tall, and below that it shrinks with the canvas. */}
      <div className="space-y-2.5">
        {rows.map((row, ri) => (
        <div
          key={ri}
          style={mediaRow ? { maxWidth: CAP(compact) * rowAspect(row) + GAP * (row.length - 1) } : undefined}
          className={
            mediaRow
              ? "mx-auto flex items-start gap-2.5"
              : "grid grid-cols-1 items-start gap-2.5"
          }
        >
        {row.map((ex) => {
          // Hover state is keyed on position in the full set, not in this row.
          const i = examples.indexOf(ex);
          const usable = !!ex.prompt && !!onUsePrompt;

          // Two kinds don't fit the hover-a-thumbnail pattern: a comparison needs to be draggable,
          // and a text result needs to be readable. Both render as their own card.
          if (ex.kind === "compare" && ex.before) {
            return (
              <figure key={ex.uri} className="col-span-full space-y-2">
                {/* Capped like every other tile: a square comparison was filling the full column
                    width and running past 1000px tall. */}
                <BeforeAfter
                  before={ex.before}
                  after={ex.uri}
                  beforeLabel="Original"
                  afterLabel="Upscaled"
                  className="mx-auto w-full"
                  maxHeight={CAP(compact)}
                />
                {ex.caption && (
                  <figcaption className="text-[11px] font-mono tabular-nums text-zinc-600">{ex.caption}</figcaption>
                )}
              </figure>
            );
          }

          if (ex.kind === "text") {
            return (
              <figure key={`${ex.uri}-${i}`} className="col-span-full overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
                {ex.uri && <img src={ex.uri} alt={ex.caption ?? ""} loading="lazy" className="block max-h-44 w-full object-cover" />}
                <figcaption className="space-y-2 p-3.5">
                  {ex.caption && (
                    <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">{ex.caption}</span>
                  )}
                  <p className="flex gap-2 text-[11.5px] leading-relaxed text-zinc-300">
                    <Quote size={12} className="mt-0.5 shrink-0 text-zinc-700" />
                    <span className="line-clamp-6">{ex.output}</span>
                  </p>
                  {usable && (
                    <button
                      onClick={() => onUsePrompt!(ex.prompt!)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-black transition-colors hover:bg-zinc-200"
                    >
                      <CornerDownLeft size={10} /> Use this prompt
                    </button>
                  )}
                </figcaption>
              </figure>
            );
          }

          // Height is shared across the row; width is whatever this example's shape asks for.
          // maxWidth keeps an extreme panorama (a 6:1 banner) from running past the canvas.
          const ratio = ex.width && ex.height
            ? `${ex.width} / ${ex.height}`
            : examples.length === 1 ? "4 / 3" : "1 / 1";

          return (
            <figure
              key={ex.uri}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              style={{ flexGrow: ex.width && ex.height ? ex.width / ex.height : 1, flexBasis: 0, aspectRatio: ratio }}
              className="group relative min-w-0 overflow-hidden rounded-xl border border-white/[0.07] bg-zinc-900"
            >
              {/* The figure already carries the shape, so the media just fills it — no
                  per-branch aspect juggling, and nothing can disagree about the tile's size. */}
              {ex.kind === "video" ? (
                <video
                  src={ex.uri}
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
                  onLoadedMetadata={(e) => {
                    // Park on a frame with picture in it. These clips fade up from black, so a
                    // poster at t=0 renders as an empty tile — the same trap the hero reel hit.
                    const v = e.currentTarget;
                    if (v.duration > 1.2) v.currentTime = 1;
                  }}
                  onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 1; }}
                  className="h-full w-full object-cover"
                />
              ) : (
                <img
                  src={ex.uri}
                  alt={ex.prompt ?? ex.caption ?? ""}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              )}

              {ex.kind === "video" && active !== i && (
                <span className="pointer-events-none absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
                  <Play size={10} className="ml-px text-white" fill="currentColor" />
                </span>
              )}

              <figcaption
                className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/85 to-transparent p-3 pt-8 transition-opacity duration-200 ${
                  active === i ? "opacity-100" : "opacity-0"
                }`}
              >
                <p className="line-clamp-3 text-[11px] leading-relaxed text-zinc-300">
                  {ex.prompt ?? ex.caption}
                </p>
                {usable && (
                  <button
                    onClick={() => onUsePrompt!(ex.prompt!)}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-black transition-colors hover:bg-zinc-200"
                  >
                    <CornerDownLeft size={10} /> Use this prompt
                  </button>
                )}
              </figcaption>
            </figure>
          );
        })}
        </div>
        ))}
      </div>
    </section>
  );
}

/** Summed aspect of a row — the row is exactly this many times as wide as it is tall, plus gaps. */
function rowAspect(row: ToolExample[]): number {
  return row.reduce((sum, e) => sum + (e.width && e.height ? e.width / e.height : 1), 0);
}

/**
 * Split a set into rows of at most `max`, balanced.
 *
 * One flex row justifies beautifully but only for a handful of tiles — seven in a single row came
 * out 140px tall, too small to show anything. Splitting at three keeps tiles legible, and
 * balancing (7 becomes 3/2/2, not 3/3/1) avoids a stranded last row rendering one tile at full
 * height while the rows above it sit much smaller.
 */
function chunkRows(items: ToolExample[], max: number): ToolExample[][] {
  const n = items.length;
  if (n <= max) return [items];
  const rowCount = Math.ceil(n / max);
  const base = Math.floor(n / rowCount);
  let extra = n % rowCount;
  const out: ToolExample[][] = [];
  let at = 0;
  for (let r = 0; r < rowCount; r++) {
    const take = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
    out.push(items.slice(at, at + take));
    at += take;
  }
  return out;
}
