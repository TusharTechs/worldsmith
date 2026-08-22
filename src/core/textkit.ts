export interface TextLayer {
  id: string;
  text: string;
  font: string;
  sizePct: number;          // % of image height (resolution-independent)
  color: string;
  strokeColor: string;
  strokeWidthPct: number;   // % of font size
  shadow: "none" | "soft" | "glow";
  weight: number;
  italic: boolean;
  uppercase: boolean;
  letterSpacingPct: number;
  rotationDeg: number;
  x: number;                // normalized CENTER, 0..1
  y: number;                // normalized CENTER, 0..1
  align: "center" | "left" | "right"; // aligns lines WITHIN the centered block
}

export const TEXTKIT_FONTS: Record<string, { label: string; family: string }> = {
  anton:      { label: "Anton (Impact-style)", family: "'Anton', sans-serif" },
  bebas:      { label: "Bebas Neue",           family: "'Bebas Neue', sans-serif" },
  oswald:     { label: "Oswald",               family: "'Oswald', sans-serif" },
  montserrat: { label: "Montserrat Black",     family: "'Montserrat', sans-serif" },
  playfair:   { label: "Playfair (Serif)",     family: "'Playfair Display', serif" },
  grotesk:    { label: "Space Grotesk",        family: "'Space Grotesk', sans-serif" },
};

export const TEXTKIT_PRESETS: Record<string, Partial<TextLayer>> = {
  "YT Bold":   { font: "anton",  color: "#ffffff", strokeColor: "#000000", strokeWidthPct: 8, shadow: "soft", uppercase: true,  weight: 400, letterSpacingPct: 2 },
  "Neon Glow": { font: "bebas",  color: "#7df9ff", strokeColor: "#000000", strokeWidthPct: 0, shadow: "glow", uppercase: true,  weight: 400, letterSpacingPct: 6 },
  "Cinematic": { font: "playfair", color: "#f5e9d0", strokeColor: "#000000", strokeWidthPct: 0, shadow: "soft", uppercase: true, weight: 700, letterSpacingPct: 18 },
  "Minimal":   { font: "grotesk", color: "#ffffff", strokeColor: "#000000", strokeWidthPct: 0, shadow: "none", uppercase: false, weight: 500, letterSpacingPct: 4 },
};

export function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function defaultLayer(text = "YOUR TITLE"): TextLayer {
  return {
    id: uid(), text, font: "anton", sizePct: 12,
    color: "#ffffff", strokeColor: "#000000", strokeWidthPct: 6,
    shadow: "soft", weight: 400, italic: false, uppercase: true,
    letterSpacingPct: 2, rotationDeg: 0, x: 0.5, y: 0.5, align: "center",
  };
}

export interface LayerMetrics {
  lines: string[];
  lineHeight: number;
  width: number;
  height: number;
  asc: number;   // visual ascent above baseline (glyph-accurate)
  desc: number;
}

/**
 * Measure a layer from ACTUAL glyph bounds so the selection box hugs the text
 * and the block is truly centered on (x, y).
 */
export function layerMetrics(ctx: CanvasRenderingContext2D, L: TextLayer, canvasH: number): LayerMetrics {
  const size = (L.sizePct / 100) * canvasH;
  const family = TEXTKIT_FONTS[L.font]?.family ?? L.font;
  ctx.font = `${L.italic ? "italic " : ""}${L.weight} ${size}px ${family}`;
  try { (ctx as any).letterSpacing = `${(L.letterSpacingPct / 100) * size}px`; } catch {}

  const lines = L.text.split("\n").map((s) => (L.uppercase ? s.toUpperCase() : s));
  const lineHeight = size * 1.15;

  let width = 0;
  let asc = 0;
  let desc = 0;
  for (const line of lines) {
    const m = ctx.measureText(line);
    width = Math.max(width, m.width);
    asc = Math.max(asc, m.actualBoundingBoxAscent || size * 0.75);
    desc = Math.max(desc, m.actualBoundingBoxDescent || size * 0.25);
  }

  const stroke = (L.strokeWidthPct / 100) * size;
  width += stroke + size * 0.08;
  const height = (lines.length - 1) * lineHeight + asc + desc + stroke;
  return { lines, lineHeight, width, height, asc, desc };
}

/**
 * Shared renderer (preview + export).
 * The block is ALWAYS centered on (x, y); align positions lines within the block.
 */
export function renderLayers(ctx: CanvasRenderingContext2D, layers: TextLayer[], w: number, h: number): void {
  for (const L of layers) {
    const size = (L.sizePct / 100) * h;
    const m = layerMetrics(ctx, L, h);
    const stroke = (L.strokeWidthPct / 100) * size;
    const pad = stroke / 2;

    ctx.save();
    ctx.textBaseline = "alphabetic";
    ctx.translate(L.x * w, L.y * h);
    ctx.rotate((L.rotationDeg * Math.PI) / 180);

    if (L.shadow === "soft") {
      ctx.shadowColor = "rgba(0,0,0,0.85)";
      ctx.shadowBlur = size * 0.25;
      ctx.shadowOffsetY = size * 0.06;
    } else if (L.shadow === "glow") {
      ctx.shadowColor = L.color;
      ctx.shadowBlur = size * 0.6;
    }

    if (L.strokeWidthPct > 0) {
      ctx.lineJoin = "round";
      ctx.strokeStyle = L.strokeColor;
      ctx.lineWidth = stroke;
    }

    m.lines.forEach((line, i) => {
      // Baseline for line i so the whole glyph block is vertically centered
      const y = -m.height / 2 + pad + m.asc + i * m.lineHeight;
      let x = 0;
      if (L.align === "left") { ctx.textAlign = "left"; x = -m.width / 2; }
      else if (L.align === "right") { ctx.textAlign = "right"; x = m.width / 2; }
      else { ctx.textAlign = "center"; x = 0; }
      if (L.strokeWidthPct > 0) ctx.strokeText(line, x, y);
      ctx.fillStyle = L.color;
      ctx.fillText(line, x, y);
    });

    ctx.restore();
  }
}