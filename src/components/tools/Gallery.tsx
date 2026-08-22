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
      {/* Column count follows the number of examples so a short set fills its row instead of
          leaving a hole — one example goes full-bleed, three sit in threes, four in a 2×2. */}
      {/* items-start matters: with mixed aspect ratios in one row, stretched grid cells left a
          band of dead space under every tile shorter than the tallest one. Each figure should be
          exactly as tall as its own image. */}
      <div className={`grid items-start gap-2.5 ${
        examples.some((e) => e.kind === "compare" || e.kind === "text")
          ? "grid-cols-1"
          : gridCols(examples.length, compact)
      }`}>
        {examples.map((ex, i) => {
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

          return (
            <figure
              key={ex.uri}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              className="group relative overflow-hidden rounded-xl border border-white/[0.07] bg-zinc-900"
            >
              {ex.kind === "video" ? (
                /* Clips honour their declared shape, exactly like stills. Forcing aspect-square
                   here rendered a 720×1280 Short as a landscape crop of a vertical video — the
                   file was right and the tile was lying about it. */
                <div className="flex w-full justify-center bg-black/40">
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
                    style={{
                      maxHeight: CAP(compact),
                      ...(ex.width && ex.height ? { aspectRatio: `${ex.width} / ${ex.height}` } : {}),
                    }}
                    className={`h-auto w-auto max-w-full object-cover ${
                      ex.width && ex.height ? "" : examples.length === 1 ? "aspect-[4/3]" : "aspect-square"
                    }`}
                  />
                </div>
              ) : ex.width && ex.height ? (
                /* The tile keeps the format's true ratio, but capped in height and centred:
                   a 9:16 Story rendered at full canvas width came out roughly 1800px tall and
                   pushed everything else off screen. Aspect-ratio plus a max-height shrinks the
                   whole box proportionally, so the shape survives and the tile stays readable. */
                <div className="flex w-full justify-center bg-black/40">
                  <img
                    src={ex.uri}
                    alt={ex.prompt ?? ex.caption ?? ""}
                    loading="lazy"
                    style={{ aspectRatio: `${ex.width} / ${ex.height}`, maxHeight: CAP(compact) }}
                    className="h-auto w-auto max-w-full object-cover"
                  />
                </div>
              ) : (
                /* Same height cap as the dimensioned branch. Without it an example that carries no
                   declared size — a Cast character sheet, say — filled the full column width and
                   pushed the whole row past 700px, which then stretched the controls panel beside
                   it to match. */
                <div className="flex w-full justify-center bg-black/40">
                  <img
                    src={ex.uri}
                    alt={ex.prompt ?? ex.caption ?? ""}
                    loading="lazy"
                    style={{ maxHeight: CAP(compact) }}
                    className={`h-auto w-auto max-w-full object-cover ${examples.length === 1 ? "aspect-[4/3]" : "aspect-square"}`}
                  />
                </div>
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
    </section>
  );
}

/**
 * Columns = number of examples, so a set always sits in exactly one row.
 *
 * A separate heuristic used to pick columns independently of how many examples a format has, so
 * four tiles wrapped into a 2x2 while the registry believed they were a single row. Since
 * `exampleTarget` already caps a format at three, mirroring the count here keeps the two in step.
 */
function gridCols(n: number, _compact: boolean): string {
  return n >= 3 ? "grid-cols-3" : n === 2 ? "grid-cols-2" : "grid-cols-1";
}
