'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import { TextLayer, TEXTKIT_FONTS, TEXTKIT_PRESETS, renderLayers, layerMetrics, defaultLayer } from "@/core/textkit";

interface Props {
  imageUri: string;
  exportWidth: number;
  exportHeight: number;
  initialLayers?: TextLayer[];
  onSave: (dataUrl: string, layers: TextLayer[]) => Promise<void>;
  onClose: () => void;
}

const PREVIEW_W = 620;

export default function CreativeTextEditor({ imageUri, exportWidth, exportHeight, initialLayers, onSave, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [layers, setLayers] = useState<TextLayer[]>(initialLayers ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [caretOn, setCaretOn] = useState(true);
  const [caretPos, setCaretPos] = useState(0); // index into selected layer's text

  const previewH = Math.round((PREVIEW_W * exportHeight) / exportWidth);
  const selected = layers.find((l) => l.id === selectedId) ?? null;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    canvas.width = PREVIEW_W;
    canvas.height = previewH;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, PREVIEW_W, previewH);
    renderLayers(ctx, layers, PREVIEW_W, previewH);

    const sel = layers.find((l) => l.id === selectedId);

    // Glyph-accurate, rotation-aware selection box
    if (sel) {
      const m = layerMetrics(ctx, sel, previewH);
      ctx.save();
      ctx.translate(sel.x * PREVIEW_W, sel.y * previewH);
      ctx.rotate((sel.rotationDeg * Math.PI) / 180);
      ctx.strokeStyle = "#22d3ee";
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-m.width / 2, -m.height / 2, m.width, m.height);
      ctx.restore();
    }

    // Blinking caret — vertically centered on its line, positioned at caretPos
    if (sel && caretOn) {
      const size = (sel.sizePct / 100) * previewH;
      const m = layerMetrics(ctx, sel, previewH); // sets font + letterSpacing

      // Map caretPos → (line index, column)
      const rawLines = sel.text.split("\n");
      let idx = Math.min(caretPos, sel.text.length);
      let li = 0;
      while (li < rawLines.length && idx > rawLines[li].length) {
        idx -= rawLines[li].length + 1;
        li++;
      }
      if (li > rawLines.length - 1) { li = rawLines.length - 1; idx = rawLines[li]?.length ?? 0; }

      const before = (rawLines[li] ?? "").slice(0, idx);
      const sw = ctx.measureText(sel.uppercase ? before.toUpperCase() : before).width;
      const lw = ctx.measureText(m.lines[li] ?? "").width;

      let caretX = 0;
      if (sel.align === "left") caretX = -m.width / 2 + sw;
      else if (sel.align === "right") caretX = m.width / 2 - lw + sw;
      else caretX = sw - lw / 2;

      const stroke = (sel.strokeWidthPct / 100) * size;
      const pad = stroke / 2;
      const yBase = -m.height / 2 + pad + m.asc + li * m.lineHeight;
      const lineCenter = yBase - (m.asc - m.desc) / 2;   // visual center of the glyphs
      const caretTop = lineCenter - m.lineHeight / 2;    // caret spans exactly one line-height, centered
      const caretBottom = lineCenter + m.lineHeight / 2;

      ctx.save();
      ctx.translate(sel.x * PREVIEW_W, sel.y * previewH);
      ctx.rotate((sel.rotationDeg * Math.PI) / 180);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(1.5, size * 0.045);
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = 2;
      ctx.beginPath();
      ctx.moveTo(caretX, caretTop);
      ctx.lineTo(caretX, caretBottom);
      ctx.stroke();
      ctx.restore();
    }
  }, [layers, selectedId, previewH, caretOn, caretPos]);

  // Load via fetch→objectURL so the export canvas never gets CORS-tainted.
  useEffect(() => {
    let objectUrl = "";
    (async () => {
      const res = await fetch(imageUri);
      const blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { imgRef.current = img; redraw(); };
      img.src = objectUrl;
    })();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [imageUri, redraw]);

  useEffect(() => { redraw(); }, [redraw]);
  useEffect(() => {
    let mounted = true;
    document.fonts?.ready?.then(() => { if (mounted) redraw(); });
    return () => { mounted = false; };
  }, [redraw]);

  // Blink loop: restarts visible whenever selection changes
  useEffect(() => {
    if (!selectedId) return;
    setCaretOn(true);
    const iv = setInterval(() => setCaretOn((v) => !v), 530);
    return () => clearInterval(iv);
  }, [selectedId]);

  // Real text-box editing: arrows move the caret, typing inserts AT the caret.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selectedId) return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest("input, textarea, select, button")) return; // panel controls keep normal behavior
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const layer = layers.find((l) => l.id === selectedId);
      if (!layer) return;

      const len = layer.text.length;
      const pos = Math.min(caretPos, len);
      const mutate = (fn: (l: TextLayer) => Partial<TextLayer>) =>
        setLayers((ls) => ls.map((l) => (l.id === selectedId ? { ...l, ...fn(l) } : l)));

      if (e.key === "ArrowLeft") {
        e.preventDefault(); setCaretPos(Math.max(0, pos - 1)); setCaretOn(true);
      } else if (e.key === "ArrowRight") {
        e.preventDefault(); setCaretPos(Math.min(len, pos + 1)); setCaretOn(true);
      } else if (e.key === "Home") {
        e.preventDefault(); setCaretPos(0); setCaretOn(true);
      } else if (e.key === "End") {
        e.preventDefault(); setCaretPos(len); setCaretOn(true);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        if (pos > 0) {
          mutate((l) => ({ text: l.text.slice(0, pos - 1) + l.text.slice(pos) }));
          setCaretPos(pos - 1);
        }
        setCaretOn(true);
      } else if (e.key === "Enter") {
        e.preventDefault();
        mutate((l) => ({ text: l.text.slice(0, pos) + "\n" + l.text.slice(pos) }));
        setCaretPos(pos + 1); setCaretOn(true);
      } else if (e.key.length === 1) {
        e.preventDefault();
        mutate((l) => ({ text: l.text.slice(0, pos) + e.key + l.text.slice(pos) }));
        setCaretPos(pos + 1); setCaretOn(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, layers, caretPos]);

  const toNorm = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };

  /** Rotation-aware hit test against each layer's centered block. */
  const hitTest = (x: number, y: number): TextLayer | null => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return null;
    const px = x * PREVIEW_W;
    const py = y * previewH;
    for (let i = layers.length - 1; i >= 0; i--) {
      const L = layers[i];
      const m = layerMetrics(ctx, L, previewH);
      const cx = L.x * PREVIEW_W;
      const cy = L.y * previewH;
      const ang = -(L.rotationDeg * Math.PI) / 180;
      const dx = px - cx;
      const dy = py - cy;
      const rx = dx * Math.cos(ang) - dy * Math.sin(ang);
      const ry = dx * Math.sin(ang) + dy * Math.cos(ang);
      if (Math.abs(rx) <= m.width / 2 && Math.abs(ry) <= m.height / 2) return L;
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const p = toNorm(e);
    const hit = hitTest(p.x, p.y);
    if (hit) {
      setSelectedId(hit.id);
      setCaretPos(hit.text.length); // caret starts at end, like clicking a filled input
      dragRef.current = { id: hit.id, dx: p.x - hit.x, dy: p.y - hit.y };
      (e.target as Element).setPointerCapture(e.pointerId);
      (document.activeElement as HTMLElement | null)?.blur?.();
    } else {
      setSelectedId(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const p = toNorm(e);
    const { id, dx, dy } = dragRef.current;
    setLayers((ls) => ls.map((l) =>
      l.id === id ? { ...l, x: Math.min(1, Math.max(0, p.x - dx)), y: Math.min(1, Math.max(0, p.y - dy)) } : l
    ));
  };

  const onPointerUp = () => { dragRef.current = null; };

  const update = (patch: Partial<TextLayer>) => {
    if (!selectedId) return;
    setLayers((ls) => ls.map((l) => (l.id === selectedId ? { ...l, ...patch } : l)));
  };

  const exportAndSave = async () => {
    const img = imgRef.current;
    if (!img) return;
    setSaving(true);
    try {
      await Promise.all(layers.map((l) =>
        document.fonts.load(`${l.italic ? "italic " : ""}${l.weight} ${Math.round((l.sizePct / 100) * exportHeight)}px ${TEXTKIT_FONTS[l.font]?.family ?? l.font}`)
      ));
      const canvas = document.createElement("canvas");
      canvas.width = exportWidth;
      canvas.height = exportHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, exportWidth, exportHeight);
      renderLayers(ctx, layers, exportWidth, exportHeight); // caret/box are preview-only → never exported
      await onSave(canvas.toDataURL("image/png"), layers);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-6">
      <div className="flex gap-6 max-w-6xl w-full">
        <div className="flex-1 min-w-0">
          <canvas
            ref={canvasRef}
            className="w-full rounded border border-zinc-700 bg-zinc-950 touch-none cursor-move"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
          <p className="text-[10px] font-mono text-zinc-500 mt-2">
            Click text, type directly · ← → move caret · Home/End · Enter = new line · Backspace deletes · drag to move · exports at {exportWidth}×{exportHeight}
          </p>
        </div>

        <div className="w-80 shrink-0 overflow-y-auto max-h-[85vh] bg-zinc-900 border border-zinc-800 rounded p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-xs uppercase tracking-widest text-cyan-400">TextKit</h3>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xs">✕</button>
          </div>

          <button
            onClick={() => { const l = defaultLayer(); setLayers((ls) => [...ls, l]); setSelectedId(l.id); setCaretPos(l.text.length); }}
            className="w-full py-2 bg-cyan-500 text-black font-semibold rounded text-xs uppercase tracking-widest hover:bg-cyan-400"
          >
            + Add Text
          </button>

          {selected && (
            <>
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-widest text-zinc-500">Style presets</span>
                <div className="grid grid-cols-2 gap-1">
                  {Object.keys(TEXTKIT_PRESETS).map((p) => (
                    <button key={p} onClick={() => update(TEXTKIT_PRESETS[p])}
                      className="py-1 text-[10px] font-mono border border-zinc-700 rounded hover:bg-zinc-800 text-zinc-300">
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-widest text-zinc-500">Text (Enter = new line)</span>
                <textarea
                  value={selected.text}
                  rows={2}
                  onChange={(e) => {
                    update({ text: e.target.value });
                    setCaretPos(e.target.selectionStart ?? e.target.value.length);
                    setCaretOn(true);
                  }}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-zinc-200 resize-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-widest text-zinc-500">Font</span>
                <select value={selected.font} onChange={(e) => update({ font: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-zinc-200">
                  {Object.entries(TEXTKIT_FONTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </label>

              <Slider label={`Size · ${selected.sizePct}%`} min={4} max={30} step={0.5} value={selected.sizePct} onChange={(v) => update({ sizePct: v })} />
              <Slider label={`Outline · ${selected.strokeWidthPct}%`} min={0} max={20} step={0.5} value={selected.strokeWidthPct} onChange={(v) => update({ strokeWidthPct: v })} />
              <Slider label={`Letter spacing · ${selected.letterSpacingPct}`} min={0} max={30} step={1} value={selected.letterSpacingPct} onChange={(v) => update({ letterSpacingPct: v })} />
              <Slider label={`Rotation · ${selected.rotationDeg}°`} min={-45} max={45} step={1} value={selected.rotationDeg} onChange={(v) => update({ rotationDeg: v })} />

              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 block">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500">Fill</span>
                  <input type="color" value={selected.color} onChange={(e) => update({ color: e.target.value })}
                    className="w-full h-8 bg-zinc-950 border border-zinc-800 rounded" />
                </label>
                <label className="space-y-1 block">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500">Outline</span>
                  <input type="color" value={selected.strokeColor} onChange={(e) => update({ strokeColor: e.target.value })}
                    className="w-full h-8 bg-zinc-950 border border-zinc-800 rounded" />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 block">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500">Shadow</span>
                  <select value={selected.shadow} onChange={(e) => update({ shadow: e.target.value as TextLayer["shadow"] })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-zinc-200">
                    <option value="none">None</option>
                    <option value="soft">Soft</option>
                    <option value="glow">Neon glow</option>
                  </select>
                </label>
                <label className="space-y-1 block">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500">Weight</span>
                  <select value={selected.weight} onChange={(e) => update({ weight: parseInt(e.target.value) })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-zinc-200">
                    <option value={400}>Regular</option>
                    <option value={700}>Bold</option>
                    <option value={900}>Black</option>
                  </select>
                </label>
              </div>

              <div className="flex gap-2">
                <Toggle on={selected.uppercase} label="AA" onClick={() => update({ uppercase: !selected.uppercase })} />
                <Toggle on={selected.italic} label="Italic" onClick={() => update({ italic: !selected.italic })} />
                <select value={selected.align} onChange={(e) => update({ align: e.target.value as TextLayer["align"] })}
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded p-1 text-xs text-zinc-200"
                  title="Aligns lines within the block (visible with multi-line text)">
                  <option value="center">Center</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </div>

              <button
                onClick={() => { setLayers((ls) => ls.filter((l) => l.id !== selectedId)); setSelectedId(null); setCaretPos(0); }}
                className="w-full py-1 border border-red-900 text-red-400 rounded text-[10px] font-mono uppercase tracking-widest hover:bg-red-950/30"
              >
                Delete layer
              </button>
            </>
          )}

          {!selected && layers.length > 0 && (
            <p className="text-[10px] text-zinc-500 font-mono">Click a text block on the canvas to edit or type.</p>
          )}

          <div className="border-t border-zinc-800 pt-3 space-y-2">
            <button onClick={exportAndSave} disabled={saving}
              className="w-full py-2 bg-emerald-500 text-black font-semibold rounded text-xs uppercase tracking-widest hover:bg-emerald-400 disabled:opacity-50">
              {saving ? "Saving..." : "Save & Apply"}
            </button>
            <button onClick={onClose} className="w-full py-1 text-[10px] font-mono uppercase tracking-widest text-zinc-500 hover:text-zinc-300">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Slider({ label, min, max, step, value, onChange }: {
  label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full" />
    </label>
  );
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-2 py-1 text-[10px] font-mono rounded border ${on ? "border-cyan-700 text-cyan-300 bg-cyan-950/30" : "border-zinc-700 text-zinc-500"}`}>
      {label}
    </button>
  );
}