/**
 * Worldsmith brand mark — "The Struck Sphere".
 *
 * A world-ring caught mid-forge: the ring is drawn thin where the hammer broke it and heavy
 * on the opposite arc (the taper of drawn molten metal), with a chip of light flying off the
 * break. Craft × cosmos — the one territory no major AI tool occupies (they're all blobs,
 * letter-monograms, sparkles, or prisms), and it matches the product's own "not a generator,
 * a studio" positioning.
 *
 * Geometry lives on a 100×100 viewBox so every consumer (header, favicon, app icon, OG image)
 * renders from one source of truth.
 */

/** Outer ring: tapered annulus, broken at the upper right. */
export const MARK_RING =
  "M85.95 32.47 A40 40 0 1 1 63.68 12.41 L61.23 23.54 A25 25 0 1 0 75.15 36.07 Z";
/** The chip of light struck off the break. */
export const MARK_CHIP = "M92.12 3.21 L89.82 13.25 L80.08 16.59 L82.38 6.55 Z";

export const BRAND_CYAN = "#22d3ee";
export const BRAND_FUCHSIA = "#e879f9";

/**
 * The mark on its own, transparent background — for the app header and light/dark UI.
 * `mono` renders in `currentColor` instead of the brand gradient (for one-colour contexts
 * like print, embroidery, or a monochrome footer).
 */
export function WorldsmithMark({
  size = 32,
  className = "",
  mono = false,
  title,
}: {
  size?: number;
  className?: string;
  mono?: boolean;
  title?: string;
}) {
  const fill = mono ? "currentColor" : "url(#ws-mark-grad)";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {!mono && (
        <defs>
          {/* Bottom-left (heavy arc) cyan → top-right (the break) fuchsia, so the colour
              gets hotter toward the strike. */}
          <linearGradient id="ws-mark-grad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor={BRAND_CYAN} />
            <stop offset="1" stopColor={BRAND_FUCHSIA} />
          </linearGradient>
        </defs>
      )}
      <path d={MARK_RING} fill={fill} />
      <path d={MARK_CHIP} fill={fill} />
    </svg>
  );
}
