import type { LucideIcon } from "lucide-react";
import {
  PenLine, Sparkles, Layers, Zap, Eye, Flame, Repeat, BadgeCheck, Timer, Palette, Briefcase, Target,
  MonitorPlay, Aperture, Layout, Lightbulb, ShieldCheck, TrendingUp, Globe2,
} from "lucide-react";
import type { PlatformKey } from "@/components/ui/PlatformIcon";

export interface PlatformProfile {
  label: string;
  /** Tailwind gradient stops used for the hero icon badge + ambient glow — each platform gets its own identity, not the house cyan/fuchsia. */
  gradient: string;
  glow: string; // matching radial-glow color for the hero background
  tagline: string;
  valueProps: string[];
  steps: { icon: LucideIcon; title: string; desc: string }[];
  /** Deeper "why professionals use this" pitch — 3 cards, richer than the valueProps chips. */
  benefits: { icon: LucideIcon; title: string; desc: string }[];
}

export const PLATFORM_PROFILES: Record<PlatformKey, PlatformProfile> = {
  youtube: {
    label: "YouTube",
    gradient: "from-red-600 to-rose-500",
    glow: "rgba(225,29,72,0.25)",
    tagline: "Thumbnails that win the click, videos that hold retention, and a faceless channel that never runs out of ideas.",
    valueProps: ["Legible at 120px — built for mobile thumbnails", "Faceless & narrated channel-ready", "Shorts and long-form, same visual identity"],
    steps: [
      { icon: PenLine, title: "Describe the video", desc: "The hook, the subject, the mood — what makes someone click." },
      { icon: Flame, title: "We optimize for CTR", desc: "High-contrast, face/text-legible composition at thumbnail scale." },
      { icon: Sparkles, title: "Get your creative", desc: "Sized exactly for YouTube — thumbnail, banner, avatar, or video." },
    ],
    benefits: [
      { icon: Flame, title: "Thumbnails built to win the click", desc: "High-contrast, legible-at-120px composition — the exact scale a mobile thumbnail actually renders at." },
      { icon: MonitorPlay, title: "Faceless channels, done right", desc: "Narrated, documentary, and tutorial-style channels are fully supported — no on-camera talent needed." },
      { icon: Repeat, title: "One identity, every format", desc: "Thumbnails, banners, avatars, Shorts, and long-form — visually consistent across your whole channel." },
    ],
  },
  instagram: {
    label: "Instagram",
    gradient: "from-fuchsia-500 via-pink-500 to-amber-400",
    glow: "rgba(217,70,239,0.25)",
    tagline: "Feed posts, Stories, and Reels covers that match your grid's aesthetic.",
    valueProps: ["Native ratios for feed, Reels, and Stories", "On-model with your brand's visual style", "Caption-safe composition"],
    steps: [
      { icon: PenLine, title: "Describe the moment", desc: "What's the post about — product, story, behind-the-scenes." },
      { icon: Layers, title: "Pick your format", desc: "Square feed post, 4:5 portrait, Reel cover, or Story." },
      { icon: Sparkles, title: "Get a feed-ready creative", desc: "On-brand, on-aesthetic, sized exactly right." },
    ],
    benefits: [
      { icon: Layers, title: "Every native format", desc: "Feed squares, 4:5 portraits, Reels covers, and Stories — sized exactly as Instagram expects." },
      { icon: Palette, title: "Matches your grid's aesthetic", desc: "On-brand, on-model output that fits between your other posts, not around them." },
      { icon: Aperture, title: "Caption-safe by design", desc: "Composition leaves room for captions and UI overlays without cropping the subject." },
    ],
  },
  tiktok: {
    label: "TikTok",
    gradient: "from-cyan-400 via-fuchsia-500 to-rose-500",
    glow: "rgba(34,211,238,0.22)",
    tagline: "Covers and clips built for the For You Page — bold, fast, unmistakable.",
    valueProps: ["Vertical-first, FYP-optimized framing", "High-contrast for silent autoplay scrolling", "Fast turnaround for trend-jacking"],
    steps: [
      { icon: PenLine, title: "Describe the hook", desc: "The first half-second decides if they keep scrolling." },
      { icon: Zap, title: "We frame it vertical", desc: "9:16, bold and legible even muted and thumbnail-sized." },
      { icon: Sparkles, title: "Get your creative", desc: "Cover or clip, ready to post to the FYP." },
    ],
    benefits: [
      { icon: Zap, title: "Built for the scroll", desc: "Bold, high-contrast framing that reads instantly, even muted and on autoplay." },
      { icon: Timer, title: "Trend-jacking speed", desc: "Go from idea to a postable cover or clip fast enough to catch a trend while it's still moving." },
      { icon: Repeat, title: "Vertical-first, every time", desc: "9:16 framing, optimized for the FYP, not adapted from a horizontal source." },
    ],
  },
  pinterest: {
    label: "Pinterest",
    gradient: "from-red-600 to-rose-400",
    glow: "rgba(225,29,72,0.22)",
    tagline: "Vertical pins built to get saved, clicked, and re-pinned for months.",
    valueProps: ["Tall 2:3 format proven to perform on Pinterest", "Text-safe composition for overlays", "Evergreen — pins keep surfacing long after posting"],
    steps: [
      { icon: PenLine, title: "Describe the idea", desc: "What's the pin about — a look, a recipe, a how-to, a product." },
      { icon: Repeat, title: "We frame it tall", desc: "The vertical ratio Pinterest's algorithm favors." },
      { icon: Sparkles, title: "Get your pin", desc: "Ready to save, click through, and resurface for months." },
    ],
    benefits: [
      { icon: Repeat, title: "Built to resurface for months", desc: "Pinterest's algorithm keeps evergreen pins circulating — the format here is tuned for that lifespan." },
      { icon: Layout, title: "The 2:3 ratio that performs", desc: "Tall, scroll-stopping framing proven to outperform square or landscape pins." },
      { icon: Lightbulb, title: "Text-safe composition", desc: "Room for text overlays without covering the subject — ready for how Pinterest is actually browsed." },
    ],
  },
  x: {
    label: "X",
    gradient: "from-zinc-300 to-zinc-500",
    glow: "rgba(212,212,216,0.18)",
    tagline: "Post images, cards, and headers built for the timeline's fast scroll.",
    valueProps: ["16:9 crop that survives the timeline's preview crop", "Bold contrast for a small feed thumbnail", "Header and profile sizing, exact"],
    steps: [
      { icon: PenLine, title: "Describe the post", desc: "The point you're making — sharp and to the point." },
      { icon: Target, title: "We frame for the timeline", desc: "Composition that reads clearly at feed-thumbnail size." },
      { icon: Sparkles, title: "Get your creative", desc: "Post image, card, header, or profile photo." },
    ],
    benefits: [
      { icon: Eye, title: "Fast, sharp, to the point", desc: "Bold contrast for a feed where a post has a fraction of a second to land." },
      { icon: Layout, title: "Every size, covered", desc: "Post images, link cards, headers, and profile photos — exact dimensions, no stretching." },
      { icon: Target, title: "Survives the timeline crop", desc: "Framed so the subject reads clearly even after the timeline's aggressive preview crop." },
    ],
  },
  linkedin: {
    label: "LinkedIn",
    gradient: "from-blue-600 to-sky-400",
    glow: "rgba(37,99,235,0.22)",
    tagline: "Professional, on-brand visuals for posts, covers, and company pages.",
    valueProps: ["Polished, professional visual tone", "Native sizing for posts, covers, and banners", "Consistent with your brand's identity"],
    steps: [
      { icon: PenLine, title: "Describe the post", desc: "The insight, announcement, or story you're sharing." },
      { icon: Briefcase, title: "We keep it professional", desc: "Clean, credible composition suited to a business audience." },
      { icon: Sparkles, title: "Get your creative", desc: "Post image, cover, or company banner, sized exactly right." },
    ],
    benefits: [
      { icon: Briefcase, title: "Reads as credible, not promotional", desc: "Clean, professional composition suited to a business audience and a company page." },
      { icon: ShieldCheck, title: "Consistent brand identity", desc: "Posts, covers, and banners that all look like they came from the same company." },
      { icon: TrendingUp, title: "Built for engagement, not just polish", desc: "Composition tuned for a feed where thought leadership and updates compete for attention." },
    ],
  },
  facebook: {
    label: "Facebook",
    gradient: "from-blue-500 to-indigo-500",
    glow: "rgba(59,130,246,0.22)",
    tagline: "Feed and cover creatives built for reach and shares.",
    valueProps: ["Sized for feed and cover placements", "Warm, shareable composition", "Consistent with your other platforms"],
    steps: [
      { icon: PenLine, title: "Describe the post", desc: "What you want your community to see." },
      { icon: BadgeCheck, title: "We optimize for shares", desc: "Warm, inviting composition built for a feed audience." },
      { icon: Sparkles, title: "Get your creative", desc: "Feed-ready, sized exactly right." },
    ],
    benefits: [
      { icon: BadgeCheck, title: "Optimized for shares", desc: "Warm, inviting composition built for a feed where reach depends on being re-shared." },
      { icon: Globe2, title: "Feed and cover, matched", desc: "Sized precisely for both placements so your page looks considered, not improvised." },
      { icon: Repeat, title: "Consistent with your other platforms", desc: "The same visual identity you're already using on Instagram and YouTube, adapted correctly." },
    ],
  },
  discord: {
    label: "Discord",
    gradient: "from-indigo-500 to-violet-500",
    glow: "rgba(99,102,241,0.2)",
    tagline: "Server art and banners with a consistent visual identity.",
    valueProps: ["Sized for server icons and banners", "Consistent with your brand's identity", "Bold enough to stand out in a sidebar"],
    steps: [
      { icon: PenLine, title: "Describe the look", desc: "The mood and identity of your community." },
      { icon: Palette, title: "We keep it on-brand", desc: "Consistent style across icon, banner, and assets." },
      { icon: Sparkles, title: "Get your creative", desc: "Ready to drop into your server settings." },
    ],
    benefits: [
      { icon: Palette, title: "A consistent server identity", desc: "Icon, banner, and channel assets that all read as one deliberate aesthetic." },
      { icon: Zap, title: "Stands out in a sidebar", desc: "Bold enough to be recognizable at icon size, in a list next to dozens of other servers." },
      { icon: Repeat, title: "Built for a community, not a feed", desc: "Tone and composition suited to a space people return to daily, not scroll past once." },
    ],
  },
};

export function platformProfile(p?: string | null): PlatformProfile | null {
  if (!p) return null;
  return (PLATFORM_PROFILES as Record<string, PlatformProfile>)[p] ?? null;
}
