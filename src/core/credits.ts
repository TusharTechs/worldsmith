export const CREDIT_PRICES = {
  image: 5,
  videoPerSecond: 40,
  tts: 2,
  prompt: 1,
  upscale: 3,
  socialPost: 6,
} as const;

export type ToolKind = keyof typeof CREDIT_PRICES;

export const FREE_TRIAL_CREDITS = 15;

/**
 * Credit allowances, set so the ladder actually works.
 *
 * Two constraints have to hold at once. Cost per credit rises as the tier gets bigger, so $/credit
 * must DESCEND up the ladder or there is no reason to upgrade — an earlier pass left Studio dearer
 * per credit than Creator. And a video credit costs us $0.40/40 = $0.010, so Creator at $15/1,500
 * was selling credits at exactly cost: break-even before payment fees.
 *
 *   Creator  $15 / 1,200  = $0.0125/cr   20% margin if every credit goes to video
 *   Studio   $39 / 3,300  = $0.0118/cr   15%
 *   Agency   $95 / 8,200  = $0.0116/cr   14%
 *
 * Those are the worst case; at realistic utilisation the blended margin is ~52-55%. Creator still
 * covers one full 15-second production (1,047 credits).
 */
export const PLANS = {
  creator: { name: "Creator", monthly: 19, annual: 15, credits: 1200 },
  studio:  { name: "Studio",  monthly: 49, annual: 39, credits: 3300 },
  agency:  { name: "Agency",  monthly: 119, annual: 95, credits: 8200 },
} as const;

/**
 * One-off top-ups, priced above every subscription tier on purpose — a pack should never be the
 * cheaper way to buy credits, or it cannibalises the plans. Within that ceiling they were far too
 * dear: the old entry pack was 500 credits for $12 ($0.024/cr, nearly twice Creator's rate) and
 * did not even cover half a production. Each pack is now sized against something real — roughly
 * one, three and seven 15-second productions.
 *
 *   1,200 / $18  = $0.0150/cr   33% margin, ~1 production
 *   3,000 / $42  = $0.0140/cr   29% margin, ~3 productions
 *   7,000 / $90  = $0.0129/cr   22% margin, ~7 productions
 *
 * NOTE: `id` is part of the Dodo product key ("pack:<id>"), so changing these means adding the
 * matching products in the Dodo dashboard and updating DODO_PRODUCT_IDS / DODO_PRODUCT_MAP.
 */
export const PACKS = [
  { id: "1200", credits: 1200, price: 18 },
  { id: "3000", credits: 3000, price: 42 },
  { id: "7000", credits: 7000, price: 90 },
] as const;

export function estimateCredits(kind: ToolKind, seconds = 0): number {
  if (kind === "videoPerSecond") return CREDIT_PRICES.videoPerSecond * Math.max(1, Math.round(seconds));
  return CREDIT_PRICES[kind];
}

/** Veo renders fixed-length clips, so a 5-second shot is still billed as a full clip. */
export const VEO_CLIP_SECONDS = 8;
/** What the storyboard agent typically produces; used only to guess a shot count up front. */
const AVG_SHOT_SECONDS = 5;

/**
 * What one full Studio production is likely to cost, in credits, before the storyboard exists.
 *
 * Shared by the composer (what the user is quoted) and by startProduction (what is actually
 * enforced) so the two can never disagree. The old formula was `duration * 50 + 75`, which
 * silently assumed video is billed by the second of *finished film* — but each shot becomes one
 * fixed-length Veo render, so a 15-second film with three shots bills 24 seconds of video. That
 * quoted 825 credits against a real video cost of 1,200, and the gate let people start runs they
 * could not finish.
 */
export function estimateProductionCredits(durationSec: number): number {
  const clips = Math.max(1, Math.ceil(Math.max(1, durationSec) / AVG_SHOT_SECONDS));
  const video = estimateCredits("videoPerSecond", clips * VEO_CLIP_SECONDS);
  const stills = estimateCredits("image") * (clips + 6);   // first frames + characters/locations/props
  const narration = estimateCredits("tts");
  const creatives = estimateCredits("image") * 8;          // one on-model creative per platform
  return video + stills + narration + creatives;
}

/**
 * Prices we genuinely charged before the current ones.
 *
 * This table exists so the UI can show a struck-through "was" figure. Every entry must be a rate
 * this product actually billed at — a reference price that was never charged is a fabricated
 * discount, which is a regulated practice (FTC, UK CMA, and the EU Omnibus Directive all require
 * the prior price to be real). If a price never dropped, it gets no entry and the UI shows no
 * strikethrough. Delete entries once the drop is old enough to stop being news.
 *
 * videoPerSecond: 50 → 40 on 2026-08-22, when per-clip billing was corrected.
 */
export const PREVIOUS_CREDIT_PRICES: Partial<Record<ToolKind, number>> = {
  videoPerSecond: 50,
};

/** The prior cost of the same job, or null when this kind has no genuine earlier price. */
export function previousCredits(kind: ToolKind, seconds = 0): number | null {
  const was = PREVIOUS_CREDIT_PRICES[kind];
  if (was == null) return null;
  const before = kind === "videoPerSecond" ? was * Math.max(1, Math.round(seconds)) : was;
  return before > estimateCredits(kind, seconds) ? before : null;
}
