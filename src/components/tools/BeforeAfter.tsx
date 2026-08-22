'use client';

import { useCallback, useRef, useState } from "react";
import { MoveHorizontal } from "lucide-react";

/**
 * Drag-to-compare.
 *
 * Upscaling is the one tool whose output looks identical to its input in a thumbnail — the whole
 * value is in detail you only see by comparing. A side-by-side at gallery size proves nothing, so
 * the two images are stacked and revealed against each other under a draggable seam.
 *
 * Keyboard accessible: the seam is driven by a range input, so arrow keys move it.
 */
export function BeforeAfter({
  before, after, beforeLabel = "Before", afterLabel = "After", className = "", maxHeight,
}: {
  before: string; after: string; beforeLabel?: string; afterLabel?: string;
  className?: string;
  /** Ceiling on rendered height; the frame keeps its aspect and shrinks to fit. */
  maxHeight?: number;
}) {
  const [pos, setPos] = useState(50);
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const moveTo = useCallback((clientX: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    setPos(Math.min(100, Math.max(0, ((clientX - box.left) / box.width) * 100)));
  }, []);

  return (
    <div
      ref={frame}
      onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); moveTo(e.clientX); }}
      onPointerMove={(e) => { if (dragging.current) moveTo(e.clientX); }}
      onPointerUp={() => { dragging.current = false; }}
      style={maxHeight ? { maxWidth: maxHeight } : undefined}
      className={`relative touch-none select-none overflow-hidden rounded-xl border border-white/[0.09] bg-black ${className}`}
    >
      <img src={after} alt={afterLabel} className="block w-full" draggable={false} />

      {/* The "before" copy sits on top at full frame size and is *clipped* to the left of the
          seam. An overflow-hidden wrapper whose width is the seam position would instead resize
          the image to that width, so the two halves drifted out of register as the seam moved —
          the same feature appeared at two different x positions. clip-path reveals rather than
          resizes, which keeps the pixels aligned. */}
      <img
        src={before}
        alt={beforeLabel}
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      />

      <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-widest text-zinc-300 backdrop-blur-sm">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-widest text-cyan-300 backdrop-blur-sm">
        {afterLabel}
      </span>

      <div className="pointer-events-none absolute inset-y-0 w-px bg-white/80" style={{ left: `${pos}%` }} />
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        aria-label={`Reveal ${afterLabel} against ${beforeLabel}`}
        onChange={(e) => setPos(Number(e.target.value))}
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
      <span
        className="pointer-events-none absolute top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-black/70 backdrop-blur-sm"
        style={{ left: `${pos}%` }}
      >
        <MoveHorizontal size={13} className="text-white" />
      </span>
    </div>
  );
}
