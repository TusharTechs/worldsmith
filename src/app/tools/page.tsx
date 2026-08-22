'use client';

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  serverToolTextToImage, serverToolTextToVideo, serverToolImageToVideo,
  serverToolFlowToVideo, serverToolTextToSpeech, serverToolImageToPrompt,
  serverToolUpscaleImage, serverToolSocialPost, serverToolYouTubeKit,
  serverListToolRuns, ToolResult, YouTubeKitResult,
} from "@/app/actions/tools";
import {
  serverCreateCharacter, serverListCharacters, serverDeleteCharacter, serverGenerateCharacterScene,
} from "@/app/actions/characters";
import type { Character } from "@/store/characters-store";
import { estimateCredits, previousCredits } from "@/core/credits";
import { serverGetCredits } from "@/app/actions/billing";
import { useAuth } from "@/components/AuthProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { Dropdown } from "@/components/ui/Dropdown";
import { Label } from "@/components/ui/Input";
import { PlatformIcon, type PlatformKey } from "@/components/ui/PlatformIcon";
import { PLATFORM_PROFILES, platformProfile } from "./platform-profiles";
import { TOOL_EXAMPLES, PLATFORM_SIZE_EXAMPLES, type ToolExample } from "./examples";
import { Gallery } from "@/components/tools/Gallery";
import { SizeShowcase } from "@/components/tools/SizeShowcase";
import { downloadFromUri, downloadText, assetFilename } from "@/lib/download";
import { uploadImage } from "@/lib/upload-image";
import { useTypewriterPlaceholder } from "@/lib/use-typewriter";
import {
  ImageIcon, Film, Wand2, Mic, Search, Maximize2, Megaphone, Play, Users, Trash2, Sparkles,
  PenLine, Clapperboard, Upload, Copy, CheckCircle2, Gauge, Repeat2, Layout, Rocket, Star,
  ShieldCheck, MonitorPlay, Clock3, Lightbulb, Flame, Download, Type, MousePointer2, Loader2, Lock,
  type LucideIcon,
} from "lucide-react";
import CreativeTextEditor from "@/components/CreativeTextEditor";
import type { TextLayer } from "@/core/textkit";

/**
 * `name` is the functional pair — it stays, because it is what people search for and what the
 * nav and deep links say. `display` is what the page leads with: "Text → Image" is an engineering
 * label, and setting it as a 26px headline made the arrow the loudest glyph on the screen. The
 * pair now runs above the title as a small mono eyebrow, where an arrow reads correctly.
 */
const TOOLS = [
  { id: "t2i",  icon: ImageIcon, name: "Text → Image",        display: "Imagine",    cost: "5 cr" },
  { id: "t2v",  icon: Film,      name: "Text → Video",        display: "Motion",     cost: "40/sec" },
  { id: "i2v",  icon: Wand2,     name: "Image → Video",       display: "Animate",    cost: "40/sec" },
  { id: "flow", icon: Sparkles,  name: "Voiceover + Images → Video", display: "Scene", cost: "40/sec +2" },
  { id: "tts",  icon: Mic,       name: "Text → Speech",       display: "Voice",      cost: "2 cr" },
  { id: "i2p",  icon: Search,    name: "Image → Prompt",      display: "Decode",     cost: "1 cr" },
  { id: "upscale", icon: Maximize2, name: "Upscale Image",    display: "Enhance",    cost: "3 cr" },
  { id: "text", icon: Type,         name: "Creative Text Editor", display: "TextKit", cost: "Free" },
  { id: "social", icon: Megaphone,  name: "Social Post",      display: "Post",       cost: "6 cr" },
  { id: "ytkit", icon: Play,        name: "YouTube Kit",      display: "Channel Kit", cost: "40/sec +5" },
  { id: "cast", icon: Users,        name: "Cast",             display: "Cast",       cost: "5 cr" },
] as const;

/**
 * A hue per tool, keyed to what the tool makes — stills cool, motion violet, audio warm, social
 * hot. Two reasons this exists. Every tool used to wear the same bright brand gradient on its
 * header chip, so the eleven pages were indistinguishable at a glance and the chip was the
 * loudest thing on screen — louder than the title it was labelling. And with a hue in hand, the
 * icon tile, the focus ring on the prompt field and the accent text can all agree, which is what
 * makes a page feel designed rather than assembled.
 *
 * Written as whole class strings because Tailwind cannot see interpolated class names.
 */
const TOOL_ACCENT: Record<string, { tile: string; icon: string; focus: string; text: string; glow: string }> = {
  t2i:     { tile: "bg-cyan-500/10 border-cyan-500/25",       icon: "text-cyan-300",    focus: "focus-within:border-cyan-500/50 focus-within:ring-cyan-500/20",       text: "text-cyan-400",    glow: "rgba(34,211,238,0.16)" },
  t2v:     { tile: "bg-violet-500/10 border-violet-500/25",   icon: "text-violet-300",  focus: "focus-within:border-violet-500/50 focus-within:ring-violet-500/20",   text: "text-violet-400",  glow: "rgba(167,139,250,0.16)" },
  i2v:     { tile: "bg-indigo-500/10 border-indigo-500/25",   icon: "text-indigo-300",  focus: "focus-within:border-indigo-500/50 focus-within:ring-indigo-500/20",   text: "text-indigo-400",  glow: "rgba(129,140,248,0.16)" },
  flow:    { tile: "bg-fuchsia-500/10 border-fuchsia-500/25", icon: "text-fuchsia-300", focus: "focus-within:border-fuchsia-500/50 focus-within:ring-fuchsia-500/20", text: "text-fuchsia-400", glow: "rgba(232,121,249,0.16)" },
  tts:     { tile: "bg-amber-500/10 border-amber-500/25",     icon: "text-amber-300",   focus: "focus-within:border-amber-500/50 focus-within:ring-amber-500/20",     text: "text-amber-400",   glow: "rgba(251,191,36,0.16)" },
  i2p:     { tile: "bg-sky-500/10 border-sky-500/25",         icon: "text-sky-300",     focus: "focus-within:border-sky-500/50 focus-within:ring-sky-500/20",         text: "text-sky-400",     glow: "rgba(56,189,248,0.16)" },
  upscale: { tile: "bg-teal-500/10 border-teal-500/25",       icon: "text-teal-300",    focus: "focus-within:border-teal-500/50 focus-within:ring-teal-500/20",       text: "text-teal-400",    glow: "rgba(45,212,191,0.16)" },
  text:    { tile: "bg-emerald-500/10 border-emerald-500/25", icon: "text-emerald-300", focus: "focus-within:border-emerald-500/50 focus-within:ring-emerald-500/20", text: "text-emerald-400", glow: "rgba(52,211,153,0.16)" },
  social:  { tile: "bg-rose-500/10 border-rose-500/25",       icon: "text-rose-300",    focus: "focus-within:border-rose-500/50 focus-within:ring-rose-500/20",       text: "text-rose-400",    glow: "rgba(251,113,133,0.16)" },
  ytkit:   { tile: "bg-red-500/10 border-red-500/25",         icon: "text-red-300",     focus: "focus-within:border-red-500/50 focus-within:ring-red-500/20",         text: "text-red-400",     glow: "rgba(248,113,113,0.16)" },
  cast:    { tile: "bg-purple-500/10 border-purple-500/25",   icon: "text-purple-300",  focus: "focus-within:border-purple-500/50 focus-within:ring-purple-500/20",   text: "text-purple-400",  glow: "rgba(192,132,252,0.16)" },
};

/** Per-tool tagline + "how it works" — each tool reads as its own page, not a shared utility. */
const TOOL_META: Record<string, { tagline: string; valueProps: string[]; steps: { icon: LucideIcon; title: string; desc: string }[] }> = {
  t2i: {
    tagline: "Cinematic stills from a prompt, on-model with your world.",
    valueProps: ["Studio-grade composition and lighting", "Reference-aware — stays on-model", "Any size, any platform, exact pixels"],
    steps: [
      { icon: PenLine, title: "Describe the shot", desc: "Subject, style, lighting — write what you want to see." },
      { icon: Upload, title: "Add references", desc: "Optional — upload style or character refs, @mention them in your prompt." },
      { icon: Sparkles, title: "Get your image", desc: "A cinematic still in the exact size you need." },
    ],
  },
  t2v: {
    tagline: "Veo-powered clips with director-level prompts.",
    valueProps: ["Director-level camera & motion control", "Every standard aspect ratio covered", "5 seconds to 10 minutes, one prompt"],
    steps: [
      { icon: PenLine, title: "Describe the scene", desc: "Camera move, action, mood — direct it like a shot list." },
      { icon: Clapperboard, title: "Pick aspect & length", desc: "16:9, 9:16, 1:1, or 4:5 — 5 seconds up to 10 minutes." },
      { icon: Film, title: "Get your video", desc: "A finished clip, ready to post or drop into Studio." },
    ],
  },
  i2v: {
    tagline: "Animate any still with agent instructions.",
    valueProps: ["Bring any still to life", "Precise agent-directed motion", "Keeps your original composition intact"],
    steps: [
      { icon: Upload, title: "Upload a first frame", desc: "Any still image becomes the starting point." },
      { icon: Wand2, title: "Direct the motion", desc: "Describe what happens next, plus any continuity rules." },
      { icon: Film, title: "Get your video", desc: "The still, brought to life." },
    ],
  },
  flow: {
    tagline: "Narration + references + direction → finished clip.",
    valueProps: ["Narration, visuals, and motion in one pass", "Multi-reference continuity", "Full director-style control"],
    steps: [
      { icon: Mic, title: "Write the voiceover", desc: "Optional narration, spoken in the finished clip." },
      { icon: ImageIcon, title: "Add images & direction", desc: "First frame, style refs, and agent instructions." },
      { icon: Sparkles, title: "Get your video", desc: "Narration, visuals, and motion — combined." },
    ],
  },
  tts: {
    tagline: "Gemini narration with pace matched to your cut.",
    valueProps: ["Natural, broadcast-quality narration", "Pace matched to your runtime", "Ready to mix into any timeline"],
    steps: [
      { icon: PenLine, title: "Write the line", desc: "Any script, any length." },
      { icon: Mic, title: "Synthesize", desc: "Natural, clear narration in one pass." },
      { icon: Play, title: "Get your audio", desc: "Ready to mix into any video." },
    ],
  },
  i2p: {
    tagline: "Reverse-engineer any image into a reusable prompt.",
    valueProps: ["Decode any style in seconds", "Subject, lighting, and composition captured", "Reuse across every generation tool"],
    steps: [
      { icon: Upload, title: "Upload an image", desc: "Any style, subject, or composition." },
      { icon: Search, title: "We describe it", desc: "Subject, style, lighting, and composition — captured in words." },
      { icon: Copy, title: "Reuse the prompt", desc: "Paste it into any generation tool." },
    ],
  },
  upscale: {
    tagline: "Clean 2×/4× upscale for any still, in seconds.",
    valueProps: ["Print-ready detail at 4×", "Same composition, sharper result", "Seconds, not a round trip to another app"],
    steps: [
      { icon: Upload, title: "Upload a still", desc: "Any resolution, any source." },
      { icon: Maximize2, title: "Pick a scale", desc: "2× for a quick boost, 4× for print-ready detail." },
      { icon: Sparkles, title: "Get your image", desc: "Sharper, larger, same composition." },
    ],
  },
  text: {
    tagline: "Put headline type on any creative — right on the canvas, at full export resolution.",
    valueProps: ["Type directly on the image", "Exports at the original resolution", "Costs nothing — no credits, no limits"],
    steps: [
      { icon: Upload, title: "Bring an image", desc: "A Worldsmith render, a thumbnail, a photo — anything." },
      { icon: MousePointer2, title: "Type on the canvas", desc: "Click to place a block, type, drag it, restyle it." },
      { icon: Download, title: "Download the composite", desc: "Full-size PNG with the type baked in." },
    ],
  },
  social: {
    tagline: "One idea → on-brand copy + image for any platform.",
    valueProps: ["Copy and creative, matched to platform tone", "Six platforms, one workflow", "No separate copywriter or designer needed"],
    steps: [
      { icon: Megaphone, title: "Pick a platform", desc: "Instagram, TikTok, X, LinkedIn, Facebook, or Pinterest." },
      { icon: PenLine, title: "Describe the idea", desc: "What you want to say — we match the platform's tone." },
      { icon: Sparkles, title: "Get copy + image", desc: "A ready-to-post creative, generated together." },
    ],
  },
  ytkit: {
    tagline: "Video + thumbnail + title/description/tags, together.",
    valueProps: ["A full upload kit from one prompt", "Thumbnail tuned for click-through", "Perfect for faceless & narrated channels"],
    steps: [
      { icon: PenLine, title: "Describe the video", desc: "What it's about, in one or two sentences." },
      { icon: Clapperboard, title: "Pick length & aspect", desc: "Standard 16:9 or vertical Shorts." },
      { icon: Play, title: "Get the full kit", desc: "Video, matching thumbnail, and metadata — all at once." },
    ],
  },
  cast: {
    tagline: "Build a character once. Drop them into any new scene, any platform, one click at a time.",
    valueProps: ["One character, perfect consistency", "Reusable across every future scene", "Different scenes, same star"],
    steps: [
      { icon: Users, title: "Describe your character", desc: "Name, appearance, personality — plus optional reference photos." },
      { icon: Sparkles, title: "Get a character sheet", desc: "A consistent reference, saved to your account." },
      { icon: ImageIcon, title: "Drop them into any scene", desc: "One click — different scenes, same star." },
    ],
  },
};

/** Deeper "why professionals use this" pitch per tool — 3 cards, shown below the workspace. */
const TOOL_BENEFITS: Record<string, { icon: LucideIcon; title: string; desc: string }[]> = {
  t2i: [
    { icon: Gauge, title: "Studio-grade output, zero setup", desc: "No lighting rigs, no reshoots — every still comes back with cinematic composition and lighting baked in." },
    { icon: Repeat2, title: "Consistent across a whole shoot", desc: "Reference-aware generation keeps characters, products, and settings on-model across dozens of variations." },
    { icon: Layout, title: "Exact pixels for every platform", desc: "From a 1080×1080 Instagram post to a 2560×1440 YouTube banner — no cropping, no guesswork." },
  ],
  t2v: [
    { icon: Clapperboard, title: "Director-level control", desc: "Camera moves, pacing, mood — describe it like a shot list and Veo directs it exactly." },
    { icon: Rocket, title: "From idea to finished clip in minutes", desc: "No storyboard, no editing suite, no crew — a single prompt becomes a publishable clip." },
    { icon: Layout, title: "Every aspect ratio covered", desc: "16:9 for YouTube, 9:16 for Shorts and Reels, 1:1 and 4:5 for feed — one workflow, every platform." },
  ],
  i2v: [
    { icon: Wand2, title: "Bring any still to life", desc: "Product shots, portraits, concept art — animate the exact image you already have." },
    { icon: Star, title: "Precise, agent-directed motion", desc: "Describe what should move and what should stay put — the agent respects your original composition." },
    { icon: ShieldCheck, title: "Keeps your composition intact", desc: "No re-generation, no drift — the source image stays the anchor for every frame." },
  ],
  flow: [
    { icon: Sparkles, title: "A full scene in one pass", desc: "Narration, visuals, and motion generated together — no separate voiceover recording or edit pass." },
    { icon: Repeat2, title: "Multi-reference continuity", desc: "Feed in character sheets and location refs — every frame stays consistent with your world." },
    { icon: MonitorPlay, title: "Full director-style control", desc: "Agent instructions steer texture, lighting, and pacing scene to scene." },
  ],
  tts: [
    { icon: Mic, title: "Broadcast-quality narration", desc: "Gemini-powered voice synthesis, clear and natural — no recording booth required." },
    { icon: Clock3, title: "Pace matched to your runtime", desc: "Delivery speed adapts to the length of your script and cut." },
    { icon: Layout, title: "Drop into any timeline", desc: "Clean, mixable audio ready for Studio, Premiere, or any NLE." },
  ],
  i2p: [
    { icon: Search, title: "Decode any style in seconds", desc: "Subject, lighting, composition, mood — reverse-engineered into a usable prompt." },
    { icon: Repeat2, title: "Reuse it anywhere", desc: "Paste the result straight into Text→Image, Text→Video, or Flow." },
    { icon: Lightbulb, title: "Learn what makes an image work", desc: "See the exact language that produces a specific look, not just the result." },
  ],
  upscale: [
    { icon: Maximize2, title: "Print-ready detail", desc: "4× upscaling recovers sharpness for posters, covers, and large-format prints." },
    { icon: Gauge, title: "Seconds, not a round trip", desc: "No exporting to another app — upscale inline and keep working." },
    { icon: ShieldCheck, title: "Same composition, sharper result", desc: "Nothing is regenerated or reinterpreted — just cleaner, larger pixels." },
  ],
  text: [
    { icon: MousePointer2, title: "Direct manipulation, not a form", desc: "Click the canvas, type where the type goes, drag it into place. What you see is exactly what exports." },
    { icon: Maximize2, title: "Exports at full resolution", desc: "You compose against a preview, but the render happens at the image's real pixel size — no upscaled, soft text." },
    { icon: Flame, title: "Thumbnail type that survives 120px", desc: "Heavy weights, outlines, and neon glow presets built for the sizes a feed actually renders." },
  ],
  social: [
    { icon: Megaphone, title: "Copy and creative, together", desc: "One idea becomes on-brand copy and a matching image in a single pass." },
    { icon: Layout, title: "Six platforms, one workflow", desc: "Instagram, TikTok, X, LinkedIn, Facebook, Pinterest — each with its own tone and sizing." },
    { icon: Rocket, title: "No separate copywriter or designer", desc: "Skip the handoff — post-ready output straight from a single prompt." },
  ],
  ytkit: [
    { icon: Play, title: "A full upload kit, not just a video", desc: "Video, thumbnail, title, description, and tags — generated together, ready to publish." },
    { icon: Flame, title: "Thumbnails tuned for click-through", desc: "High-contrast, legible-at-120px composition built to win the click." },
    { icon: MonitorPlay, title: "Faceless-channel ready", desc: "No on-camera talent required — narrated, faceless, and documentary-style channels are a first-class use case, not an afterthought." },
  ],
  cast: [
    { icon: Users, title: "One character, perfect consistency", desc: "Build a character sheet once — every future scene stays unmistakably the same person." },
    { icon: Repeat2, title: "Reusable across any story", desc: "Drop your character into new scenes, new platforms, new formats — one click at a time." },
    { icon: Sparkles, title: "Your own recurring talent", desc: "Build a roster of consistent characters for an ongoing series, without hiring actors." },
  ],
};

/** Clickable example prompts — replace the field's content on click, so a blank page never feels intimidating. */
const PROMPT_IDEAS: Record<string, string[]> = {
  t2i: [
    "A lone astronaut planting a glowing flag on a crystal moon, cinematic wide shot",
    "Macro shot of dew on a spider web at golden hour, shallow depth of field",
    "A neon-lit ramen shop in the rain, reflections on wet asphalt, cyberpunk mood",
  ],
  t2v: [
    "Slow push-in on a lighthouse as a storm rolls in over the sea",
    "Drone shot rising over a misty pine forest at dawn",
    "A paper boat drifting down a rain-soaked city gutter, tracking shot",
  ],
  i2v: [
    "The subject slowly turns their head toward the camera and smiles",
    "Wind picks up, hair and fabric moving, camera holds steady",
    "Gentle parallax as the camera pushes in, subject stays still",
  ],
  flow: [
    "A retired lighthouse keeper recalls the night of the great storm",
    "A street vendor explains their family recipe, passed down three generations",
    "A robot wakes up alone in an abandoned workshop, learning to feel",
  ],
  tts: [
    "In a world of scrap, one small key turns toward the light.",
    "Welcome back — today we're breaking down exactly how this works, step by step.",
    "Some stories don't need a hero. They just need someone willing to listen.",
  ],
  social: [
    "We just shipped autonomous end-to-end video production — one prompt, a finished film.",
    "Behind the scenes of how we built our newest feature, in plain language.",
    "A customer story: how they went from idea to finished campaign in a day.",
  ],
  ytkit: [
    "The strange history of the world's most useless inventions, narrated documentary-style",
    "A faceless morning-routine channel: 5 habits that changed my focus",
    "Explaining a complex topic simply — how black holes actually work",
  ],
  cast: [
    "A weathered space explorer in a worn amber flight suit, short silver hair, calm expression",
    "A cheerful street chef with flour-dusted forearms and a permanent grin",
    "A quiet forest ranger with a scarred jaw and watchful eyes",
  ],
};

/** Shared visual-style chips for image/video tools — clicking appends the fragment to the prompt. */
const STYLE_PRESETS: { label: string; fragment: string }[] = [
  { label: "Cinematic", fragment: "cinematic lighting, shallow depth of field, anamorphic lens" },
  { label: "Photoreal", fragment: "photorealistic, natural lighting, 85mm lens" },
  { label: "Anime", fragment: "anime style, cel-shaded, vibrant colors" },
  { label: "3D Render", fragment: "3D render, studio lighting, octane render" },
  { label: "Documentary", fragment: "documentary style, handheld camera, natural light" },
  { label: "Vintage Film", fragment: "vintage film grain, muted colors, 35mm" },
];

/** YouTube Kit-only "channel mode" chips — the faceless/narrated-channel framing the tool is built for. */
const CHANNEL_MODES: { label: string; fragment: string }[] = [
  { label: "Faceless Narrator", fragment: "narrated voiceover, no on-camera host, b-roll driven" },
  { label: "Documentary", fragment: "documentary pacing, archival-style visuals" },
  { label: "Tutorial", fragment: "clear step-by-step tutorial framing, on-screen focus on the subject" },
  { label: "Listicle", fragment: "fast-paced listicle style, punchy cuts" },
];

function applyStyle(current: string, fragment: string): string {
  if (current.includes(fragment)) {
    return current.split(fragment).join("").replace(/,\s*,/g, ",").replace(/^\s*,\s*|\s*,\s*$/g, "").trim();
  }
  return current.trim() ? `${current.trim()}, ${fragment}` : fragment;
}

const SOCIAL_PLATFORMS = ["instagram", "tiktok", "x", "linkedin", "facebook", "pinterest"] as const satisfies readonly PlatformKey[];
type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

type ToolId = (typeof TOOLS)[number]["id"];
type DurMode = "5" | "10" | "15" | "30" | "min";

const VIDEO_ASPECTS = ["16:9", "9:16", "1:1", "4:5"] as const;
type Aspect = (typeof VIDEO_ASPECTS)[number];

const SIZE_PRESETS = [
  { key: "sq",    label: "Square 1:1",         w: 1024, h: 1024 },
  { key: "wide",  label: "Wide 16:9",          w: 1280, h: 720 },
  { key: "vert",  label: "Vertical 9:16",      w: 720,  h: 1280 },
  { key: "port",  label: "Portrait 4:5",       w: 896,  h: 1120 },
  { key: "pin",   label: "Pin 2:3",            w: 832,  h: 1248 },
  { key: "ban3",  label: "Banner 3:1",         w: 1500, h: 500 },
  { key: "card",  label: "Social card 1.91:1", w: 1200, h: 627 },
  { key: "cov4",  label: "Cover 4:1",          w: 1584, h: 396 },
  { key: "ytb",   label: "YT banner 16:9",     w: 2560, h: 1440 },
  { key: "ava",   label: "Avatar 1:1",         w: 800,  h: 800 },
  { key: "ig11",  label: "IG 1:1",             w: 1080, h: 1080 },
  { key: "ig916", label: "Story 9:16",         w: 1080, h: 1920 },
  { key: "ig45",  label: "IG 4:5",             w: 1080, h: 1350 },
  { key: "ig191", label: "IG 1.91:1",          w: 1080, h: 566 },
  { key: "pp320", label: "Profile 320",        w: 320,  h: 320 },
  { key: "pp200", label: "Profile 200",        w: 200,  h: 200 },
  { key: "pp400", label: "Profile 400",        w: 400,  h: 400 },
  { key: "pin23", label: "Pin 2:3 (1000)",     w: 1000, h: 1500 },
  { key: "pin11", label: "Pin 1:1 (1000)",     w: 1000, h: 1000 },
  { key: "pin21", label: "Long pin 1:2",       w: 1000, h: 2100 },
  { key: "x169",  label: "X post 16:9",        w: 1600, h: 900 },
  { key: "x628",  label: "X card 1.91:1",      w: 1200, h: 628 },
  { key: "li11",  label: "LI 1:1 (1200)",      w: 1200, h: 1200 },
  { key: "li191", label: "LI company banner",  w: 1128, h: 191 },
];

interface Reference {
  id: string;
  name: string;
  dataUrl: string;
}

export default function ToolsPage() {
  const auth = useAuth();

  // Deep-link: /tools?tool=i2v&ar=9:16&w=1280&h=720
  // Always starts at the SSR-safe default and applies the URL's ?tool= in an effect (below) —
  // reading window.location during the initial useState would desync server/client render
  // (server never sees the URL) and trigger a hydration-mismatch error on every deep link.
  const [tool, setTool] = useState<ToolId>("t2i");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ToolResult | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [plan, setPlan] = useState<string | undefined>(undefined);
  const [history, setHistory] = useState<any[]>([]);

  // inputs
  const [t2iPrompt, setT2iPrompt] = useState("");
  const [t2iRefs, setT2iRefs] = useState<Reference[]>([]);
  const [t2iW, setT2iW] = useState(1280);
  const [t2iH, setT2iH] = useState(720);

  const [t2vPrompt, setT2vPrompt] = useState("");
  const [t2vRefs, setT2vRefs] = useState<Reference[]>([]);
  const [t2vMode, setT2vMode] = useState<DurMode>("5");
  const [t2vMin, setT2vMin] = useState(1);
  const [t2vAspect, setT2vAspect] = useState<Aspect>("16:9");

  const [i2vImg, setI2vImg] = useState<string | null>(null);
  const [i2vPrompt, setI2vPrompt] = useState("");
  const [i2vRefs, setI2vRefs] = useState<Reference[]>([]);
  const [i2vInstr, setI2vInstr] = useState("");
  const [i2vMode, setI2vMode] = useState<DurMode>("5");
  const [i2vMin, setI2vMin] = useState(1);
  const [i2vAspect, setI2vAspect] = useState<Aspect>("16:9");

  const [flowPrompt, setFlowPrompt] = useState("");
  const [flowInstr, setFlowInstr] = useState("");
  const [flowVo, setFlowVo] = useState("");
  const [flowFirstImg, setFlowFirstImg] = useState<string | null>(null);
  const [flowRefs, setFlowRefs] = useState<Reference[]>([]);
  const [flowMode, setFlowMode] = useState<DurMode>("5");
  const [flowMin, setFlowMin] = useState(1);
  const [flowAspect, setFlowAspect] = useState<Aspect>("16:9");

  const [ttsText, setTtsText] = useState("");
  const [i2pImg, setI2pImg] = useState<string | null>(null);

  const [upscaleImg, setUpscaleImg] = useState<string | null>(null);
  const [upscaleFactor, setUpscaleFactor] = useState<2 | 4>(2);

  // Creative Text Editor — fully client-side (canvas compositing), so it costs nothing and
  // never touches a provider. `textDims` holds the source image's true pixel size so the
  // editor exports at full resolution rather than the on-screen preview size.
  const [textImg, setTextImg] = useState<string | null>(null);
  const [textDims, setTextDims] = useState<{ w: number; h: number } | null>(null);
  const [textOpen, setTextOpen] = useState(false);
  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);
  const [textOut, setTextOut] = useState<string | null>(null);

  useEffect(() => {
    if (!textImg) { setTextDims(null); return; }
    const img = new Image();
    img.onload = () => setTextDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = textImg;
  }, [textImg]);

  const [socialPlatform, setSocialPlatform] = useState<SocialPlatform>("instagram");
  const [socialIdea, setSocialIdea] = useState("");

  const [ytPrompt, setYtPrompt] = useState("");
  const [ytRefs, setYtRefs] = useState<Reference[]>([]);
  const [ytMode, setYtMode] = useState<DurMode>("5");
  const [ytMin, setYtMin] = useState(1);
  const [ytAspect, setYtAspect] = useState<Aspect>("16:9");
  const [ytKitResult, setYtKitResult] = useState<YouTubeKitResult | null>(null);

  const [characters, setCharacters] = useState<Character[]>([]);
  const [castName, setCastName] = useState("");
  const [castDesc, setCastDesc] = useState("");
  const [castRefs, setCastRefs] = useState<Reference[]>([]);
  const [castCreating, setCastCreating] = useState(false);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [castScenePrompt, setCastScenePrompt] = useState("");
  const [castSceneBusy, setCastSceneBusy] = useState(false);
  const [castSceneResult, setCastSceneResult] = useState<{ uri: string; credits: number } | null>(null);

  const loadCharacters = async () => {
    if (!auth.user) { setCharacters([]); return; }
    try { setCharacters(await serverListCharacters(await auth.user.getIdToken())); } catch {}
  };

  useEffect(() => { loadCharacters(); }, [auth.user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const createCharacter = async () => {
    if (!auth.user) { auth.openAuth(); return; }
    if (!castName.trim() || !castDesc.trim()) return;
    setCastCreating(true); setError(null);
    try {
      const c = await serverCreateCharacter(await auth.user.getIdToken(), castName, castDesc, castRefs.map((r) => r.dataUrl));
      setCharacters((prev) => [c, ...prev]);
      setSelectedCharId(c.id);
      setCastName(""); setCastDesc(""); setCastRefs([]);
    } catch (e: any) { setError(e?.message ?? "Character creation failed"); }
    finally { setCastCreating(false); loadCredits(); }
  };

  const removeCharacter = async (id: string) => {
    if (!auth.user) return;
    await serverDeleteCharacter(await auth.user.getIdToken(), id);
    setCharacters((prev) => prev.filter((c) => c.id !== id));
    if (selectedCharId === id) setSelectedCharId(null);
  };

  const generateScene = async () => {
    if (!auth.user || !selectedCharId || !castScenePrompt.trim()) return;
    setCastSceneBusy(true); setError(null); setCastSceneResult(null);
    try {
      const r = await serverGenerateCharacterScene(await auth.user.getIdToken(), selectedCharId, castScenePrompt);
      setCastSceneResult({ uri: r.uri, credits: r.credits });
    } catch (e: any) { setError(e?.message ?? "Scene generation failed"); }
    finally { setCastSceneBusy(false); loadCredits(); }
  };

  // Deep-linked platform identity (e.g. from the nav's YouTube/Instagram/etc. dropdowns) —
  // when present, the hero shows that platform's own copy/gradient instead of the generic tool.
  const [urlPlatform, setUrlPlatform] = useState<PlatformKey | null>(null);
  const [urlFormat, setUrlFormat] = useState<string | null>(null);

  // Apply navbar presets on first mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const t = p.get("tool") as ToolId | null;
    if (t && TOOLS.some((x) => x.id === t)) setTool(t);
    const ar = p.get("ar") as Aspect | null;
    if (ar && (VIDEO_ASPECTS as readonly string[]).includes(ar)) {
      setT2vAspect(ar); setI2vAspect(ar); setFlowAspect(ar);
    }
    const w = parseInt(p.get("w") ?? "", 10);
    const h = parseInt(p.get("h") ?? "", 10);
    if (w > 0 && h > 0) { setT2iW(w); setT2iH(h); }
    const plat = p.get("platform");
    if (plat && plat in PLATFORM_PROFILES) setUrlPlatform(plat as PlatformKey);
    const fmt = p.get("format");
    if (fmt) setUrlFormat(fmt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const secondsFor = (mode: DurMode, mins: number): number =>
    mode === "min" ? Math.min(600, Math.max(5, mins * 60)) : parseInt(mode);

  /**
   * ID token for a server call, or null when nobody is signed in.
   *
   * This used to assert `auth.user!`, so picking a file while signed out threw
   * "Cannot read properties of null (reading 'getIdToken')" straight into the result panel
   * instead of asking the visitor to sign in.
   */
  const token = async () => (await auth.user!.getIdToken());
  const tokenOrPrompt = async (): Promise<string | null> => {
    if (!auth.user) { auth.openAuth(); return null; }
    return auth.user.getIdToken();
  };

  const loadCredits = async () => {
    if (!auth.user) { setCredits(null); setPlan(undefined); return; }
    try {
      const t = await auth.user.getIdToken();
      const acct = await serverGetCredits(t);
      setCredits(acct.credits);
      setPlan(acct.plan);
    } catch {}
  };

  const loadHistory = async () => {
    if (!auth.user) { setHistory([]); return; }
    try {
      const t = await auth.user.getIdToken();
      setHistory(await serverListToolRuns(t));
    } catch {}
  };

  useEffect(() => { loadCredits(); loadHistory(); }, [auth.user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<ToolResult>) => {
    if (!auth.user) { auth.openAuth(); return; }
    setBusy(true); setError(null); setResult(null); setYtKitResult(null);
    try { setResult(await fn()); }
    catch (e: any) { setError(e?.message ?? "Tool failed"); }
    finally { setBusy(false); loadCredits(); loadHistory(); }
  };

  // Ref upload helper — sanitizes filename for @-mention. Falls back to a short, memorable
  // "img1"/"img2" name when the source filename is empty, overlong, or looks like a random
  // hash/UUID (photo-library exports and screenshots rarely have a name worth typing out).
  const handleUploadRefs = async (files: FileList | null, setter: Dispatch<SetStateAction<Reference[]>>) => {
    if (!files) return;
    if (!auth.user) { auth.openAuth(); return; }
    const t = await token();
    for (const file of Array.from(files)) {
      const base = (file.name.split(".")[0] || "").replace(/[^a-zA-Z0-9_-]/g, "_");
      const looksRandom = base.length === 0 || base.length > 16 || /^[0-9a-f]{6,}([_-][0-9a-f]{4,})*$/i.test(base);
      try {
        // Uploaded rather than inlined, for the same Flight argument-size reason as FilePick.
        const uri = await uploadImage(file, t);
        setter((prev) => [...prev, {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: looksRandom ? `img${prev.length + 1}` : base,
          dataUrl: uri,
        }]);
      } catch (e: any) {
        setError(e?.message ?? "Reference upload failed");
      }
    }
  };

  const active = TOOLS.find((t) => t.id === tool)!;

  const costForTool = useMemo(() => {
    switch (tool) {
      case "t2i": return estimateCredits("image");
      case "t2v": return estimateCredits("videoPerSecond", secondsFor(t2vMode, t2vMin));
      case "i2v": return estimateCredits("videoPerSecond", secondsFor(i2vMode, i2vMin));
      case "flow":
        return estimateCredits("videoPerSecond", secondsFor(flowMode, flowMin)) + (flowVo.trim() ? estimateCredits("tts") : 0);
      case "tts": return estimateCredits("tts");
      case "i2p": return estimateCredits("prompt");
      case "upscale": return estimateCredits("upscale");
      case "cast": return estimateCredits("image");
      case "social": return estimateCredits("socialPost");
      case "ytkit": return estimateCredits("videoPerSecond", secondsFor(ytMode, ytMin)) + estimateCredits("image");
      default: return 0;
    }
  }, [tool, t2vMode, t2vMin, i2vMode, i2vMin, flowMode, flowMin, flowVo, ytMode, ytMin]);

  /** The prior cost of this exact job, when there genuinely was one. Null otherwise. */
  const wasForTool = useMemo(() => {
    switch (tool) {
      case "t2v": return previousCredits("videoPerSecond", secondsFor(t2vMode, t2vMin));
      case "i2v": return previousCredits("videoPerSecond", secondsFor(i2vMode, i2vMin));
      case "flow": {
        const v = previousCredits("videoPerSecond", secondsFor(flowMode, flowMin));
        return v == null ? null : v + (flowVo.trim() ? estimateCredits("tts") : 0);
      }
      case "ytkit": {
        const v = previousCredits("videoPerSecond", secondsFor(ytMode, ytMin));
        return v == null ? null : v + estimateCredits("image");
      }
      default: return null;
    }
  }, [tool, t2vMode, t2vMin, i2vMode, i2vMin, flowMode, flowMin, flowVo, ytMode, ytMin]);

  const meta = TOOL_META[tool];

  // Platform identity: from the nav's deep link (Image/Video pages reached via YouTube ▾,
  // Instagram ▾, etc.) or, for the Social Post tool, live from whichever platform is selected
  // in its own picker. Either way, the hero becomes that platform's page, not a generic one.
  const activePlatformKey: PlatformKey | null = tool === "social" ? socialPlatform : urlPlatform;
  const activeProfile = activePlatformKey ? PLATFORM_PROFILES[activePlatformKey] : null;

  const heroTitle = activeProfile
    ? (tool === "social" ? `${activeProfile.label} Post` : `${activeProfile.label} ${urlFormat ?? ""}`.trim())
    : active.display;
  const heroEyebrow = activeProfile ? active.name : `${active.name} · ${active.cost}`;

  /** Route a gallery prompt into whichever field the current tool writes to. */
  const usePrompt = (p: string) => {
    const target: Partial<Record<ToolId, (v: string) => void>> = {
      t2i: setT2iPrompt, t2v: setT2vPrompt, i2v: setI2vPrompt, flow: setFlowPrompt,
      tts: setTtsText, social: setSocialIdea, ytkit: setYtPrompt, cast: setCastScenePrompt,
    };
    target[tool]?.(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /**
   * What the canvas shows before you generate.
   *
   * On a platform deep link this must be that platform's own creatives — landing on "YouTube
   * Avatar" and seeing a sushi chef and a racing car made the page look unrelated to YouTube.
   * The requested format sorts first, so the example you came for is the one you see.
   */
  /** Video tools must never illustrate themselves with stills. */
  const VIDEO_TOOLS = new Set(["t2v", "i2v", "flow", "ytkit"]);

  const examples: ToolExample[] = activePlatformKey
    ? ((): ToolExample[] => {
        // The platform size table is images only. On a video tool the honest answer is the tool's
        // own clips — a "YouTube Shorts" page illustrated with a thumbnail, a banner and an avatar
        // was showing three things that are not Shorts.
        const all = PLATFORM_SIZE_EXAMPLES[activePlatformKey] ?? [];
        // A video tool shows this platform's own clips when it has them; only if the platform has
        // none does it fall back to the tool's generic reel.
        if (VIDEO_TOOLS.has(tool)) {
          const own = all.filter((e) => e.kind === "video");
          if (own.length === 0) return (TOOL_EXAMPLES[tool] ?? []) as ToolExample[];

          // Each platform has only one clip per format, so a format page would show a single tile
          // in a canvas wide enough for three. Vertical formats are interchangeable in shape —
          // Shorts, Reels and TikTok are all 9:16 — so a 9:16 page shows every 9:16 clip we have,
          // its own first. Each tile names its platform, so nothing is passed off as something
          // it is not. A 16:9 page still shows only 16:9.
          const target = own.find((e) => e.format.toLowerCase() === (urlFormat ?? "").toLowerCase()) ?? own[0];
          const sameShape = Object.entries(PLATFORM_SIZE_EXAMPLES).flatMap(([plat, list]) =>
            list
              .filter((e) => e.kind === "video" && e.width / e.height === target.width / target.height)
              .map((e) => ({ plat, e }))
          );
          const ordered = [
            ...sameShape.filter(({ e }) => e.uri === target.uri),
            ...sameShape.filter(({ e }) => e.uri !== target.uri),
          ];
          return ordered.map(({ plat, e }) => ({
            uri: e.uri,
            kind: "video" as const,
            prompt: e.prompt,
            caption: `${plat[0].toUpperCase()}${plat.slice(1)} ${e.format} · ${e.width}×${e.height}`,
            width: e.width,
            height: e.height,
          }));
        }
        // A format page shows that format and nothing else. Mixing a 9:16 Story beside a 1:1 post
        // put three shapes in one row, which read as broken sizing rather than a range of options.
        //
        // Scope by the requested *dimensions*, not the format name: the nav says "Portrait Post"
        // where this table says "Post 4:5", and differs in capitalisation on six more ("Channel
        // Banner" / "Channel banner"). Name matching silently fell through to showing everything.
        // Width and height come from the same URL and cannot drift from each other.
        const bySize = all.filter((e) => e.width === t2iW && e.height === t2iH);
        const byName = urlFormat
          ? all.filter((e) => e.format.toLowerCase() === urlFormat.toLowerCase())
          : [];
        const scoped = bySize.length ? bySize : byName;
        // When a format is named but has no example yet, show nothing rather than falling back to
        // the platform's other sizes — a 200×200 profile icon on a 1080×1920 Cover page is a
        // worse answer than an honest empty state.
        const chosen = urlFormat ? scoped : (scoped.length ? scoped : all);
        return chosen.map((e) => ({
          uri: e.uri,
          kind: (e.kind ?? "image") as "image" | "video",
          prompt: e.prompt,
          caption: `${e.format} · ${e.width}×${e.height}`,
          width: e.width,
          height: e.height,
        }));
      })()
    : (TOOL_EXAMPLES[tool] ?? []);

  /** Example prompts follow the same rule: platform-appropriate on a platform page. */
  const ideasForContext = activePlatformKey
    ? (() => {
        // One suggestion per format, capped at three. Every example's prompt made a seven-chip
        // wall that buried the field it was meant to help with.
        const seen = new Set<string>();
        return (PLATFORM_SIZE_EXAMPLES[activePlatformKey] ?? [])
          .filter((e) => !seen.has(e.format) && seen.add(e.format))
          .slice(0, 3)
          .map((e) => e.prompt);
      })()
    : undefined;

  /** Whatever the user typed for the current tool — used to name downloads meaningfully. */
  const promptForTool =
    tool === "t2i" ? t2iPrompt : tool === "t2v" ? t2vPrompt : tool === "i2v" ? i2vPrompt
    : tool === "flow" ? flowPrompt : tool === "tts" ? ttsText : tool === "social" ? socialIdea
    : tool === "ytkit" ? ytPrompt : tool === "upscale" ? "upscaled" : tool === "i2p" ? "prompt" : "";
  const heroTagline = activeProfile?.tagline ?? meta?.tagline;
  const heroValueProps = activeProfile?.valueProps ?? meta?.valueProps ?? [];
  const heroSteps = activeProfile?.steps ?? meta?.steps ?? [];
  const accent = TOOL_ACCENT[tool] ?? TOOL_ACCENT.t2i;
  const heroGlow = activeProfile?.glow ?? accent.glow;
  const heroBenefits = activeProfile?.benefits ?? TOOL_BENEFITS[tool] ?? [];

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      <SiteHeader credits={credits} plan={plan} />
      <div className="mx-auto max-w-[1440px] px-5 pb-24 pt-24 sm:px-6">
        {/* TOOL BAR — identity and price in one band. The old hero stacked an icon, a title, a
            tagline, three marketing pills and a cost line before the input, so the thing you came
            to use sat below the fold on every visit. The pitch still exists; it moved under the
            workspace, where a first-time visitor reaches it after seeing the tool work. */}
        <div className="relative mb-5">
          <div
            className="pointer-events-none absolute -top-24 left-1/3 h-[260px] w-[520px] -translate-x-1/2 blur-3xl"
            style={{ background: `radial-gradient(closest-side, ${heroGlow}, transparent)` }}
          />
          <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2">
            {activePlatformKey ? (
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${activeProfile!.gradient}`}>
                <PlatformIcon platform={activePlatformKey} size={19} className="text-white" />
              </div>
            ) : (
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${accent.tile}`}>
                <active.icon size={18} className={accent.icon} strokeWidth={1.75} />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">{heroEyebrow}</p>
              <h1 className="text-[24px] font-light leading-[1.15] tracking-tight text-white sm:text-[28px]">{heroTitle}</h1>
              {heroTagline && <p className="mt-1 text-[13px] leading-snug text-zinc-400">{heroTagline}</p>}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-lg border border-white/[0.09] bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-widest">
                <span className={costForTool > 0 ? accent.text : "text-emerald-400"}>
                  {costForTool > 0 ? `${costForTool} credits` : "Free"}
                </span>
              </span>
              {credits !== null && (
                <span className="text-[10px] font-mono uppercase tracking-widest tabular-nums text-zinc-600">
                  bal {credits.toLocaleString()}
                </span>
              )}
              {auth.user && credits !== null && credits < costForTool && (
                <a href="/#pricing" className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 transition-colors hover:text-cyan-300">
                  Top up →
                </a>
              )}
            </div>
          </div>
        </div>

      {/* items-stretch (the grid default) rather than items-start: the two panels used to size
          independently, so a short result — an ultra-wide banner is barely 200px tall — sat beside
          a 600px control column and the pair read as unbalanced. Equal heights, with the result
          centred in whatever space it gets. */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        {/* WORKSPACE — the controls for this tool, and nothing competing with them. */}
        <section className="min-w-0 space-y-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 md:p-6">

            {tool === "t2i" && (
              <>
                <PromptWithRefs value={t2iPrompt} onChange={setT2iPrompt} refs={t2iRefs} ideas={ideasForContext ?? PROMPT_IDEAS.t2i}
                  placeholder="A wind-up robot discovering a glowing flower... Use @name to reference an uploaded image." />
                <RefUploader refs={t2iRefs} setRefs={setT2iRefs} onUpload={(files) => handleUploadRefs(files, setT2iRefs)} />
                <StyleChips presets={STYLE_PRESETS} value={t2iPrompt} onPick={(f) => setT2iPrompt((p) => applyStyle(p, f))} />
                <div className="flex gap-3 items-center flex-wrap">
                  <RatioSwatch w={t2iW} h={t2iH} />
                  <label className="text-xs text-zinc-500">Size</label>
                  {/* A page titled "YouTube Thumbnail" that offers 1080×1920 in a dropdown
                      contradicts its own heading — whatever came out would not be a thumbnail.
                      On a format page the size is a stated fact, not a choice; the escape hatch
                      is the generic tool, one link away. Platform pages without a named format
                      keep a picker, narrowed to that platform's own sizes. */}
                  {urlFormat ? (
                    <span className="inline-flex items-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.03] px-3 py-2">
                      <Lock size={11} className="text-zinc-600" />
                      <span className="text-[11px] font-mono tabular-nums text-zinc-200">{t2iW}×{t2iH}</span>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">{urlFormat}</span>
                    </span>
                  ) : (
                    <SizePicker
                      w={t2iW}
                      h={t2iH}
                      onPick={(w, h) => { setT2iW(w); setT2iH(h); }}
                      only={activePlatformKey ? (PLATFORM_SIZE_EXAMPLES[activePlatformKey] ?? []).map((e) => ({ label: e.format, w: e.width, h: e.height })) : undefined}
                    />
                  )}
                  <span className="text-[10px] font-mono text-zinc-500">
                    <span className={accent.text}>{estimateCredits("image")} credits</span>
                  </span>
                  {urlFormat && (
                    <a href="/tools?tool=t2i" className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 transition-colors hover:text-cyan-300">
                      Different size →
                    </a>
                  )}
                </div>
                <Go busy={busy} cost={costForTool} was={wasForTool} onClick={() => run(async () => serverToolTextToImage(
                  await token(), t2iPrompt, t2iW, t2iH, t2iRefs.map((r) => r.dataUrl)
                ))} />
              </>
            )}

            {tool === "t2v" && (
              <>
                <PromptWithRefs value={t2vPrompt} onChange={setT2vPrompt} refs={t2vRefs} ideas={ideasForContext ?? PROMPT_IDEAS.t2v}
                  placeholder="Slow push-in on a tiny robot crossing a mountain of rusted gears..." />
                <RefUploader refs={t2vRefs} setRefs={setT2vRefs} onUpload={(files) => handleUploadRefs(files, setT2vRefs)} />
                <StyleChips presets={STYLE_PRESETS} value={t2vPrompt} onPick={(f) => setT2vPrompt((p) => applyStyle(p, f))} />
                <div className="flex gap-3 items-center flex-wrap">
                  <RatioSwatch aspect={t2vAspect} />
                  <AspectPicker value={t2vAspect} onChange={setT2vAspect} lockedTo={urlFormat} />
                  <DurationPicker mode={t2vMode} setMode={setT2vMode} min={t2vMin} setMin={setT2vMin}
                    seconds={secondsFor(t2vMode, t2vMin)} />
                </div>
                <Go busy={busy} cost={costForTool} was={wasForTool} onClick={() => run(async () => serverToolTextToVideo(
                  await token(), t2vPrompt, secondsFor(t2vMode, t2vMin), t2vAspect, t2vRefs.map((r) => r.dataUrl)
                ))} />
              </>
            )}

            {tool === "i2v" && (
              <>
                <FilePick label="Source image (first frame)" accept="image/*" onDataUrl={setI2vImg} preview={i2vImg} getToken={tokenOrPrompt} onError={setError}/>
                <PromptWithRefs value={i2vPrompt} onChange={setI2vPrompt} refs={i2vRefs} ideas={ideasForContext ?? PROMPT_IDEAS.i2v}
                  placeholder="The robot slowly turns its head toward the light..." />
                <RefUploader refs={i2vRefs} setRefs={setI2vRefs} onUpload={(files) => handleUploadRefs(files, setI2vRefs)} />
                <StyleChips presets={STYLE_PRESETS} value={i2vPrompt} onPick={(f) => setI2vPrompt((p) => applyStyle(p, f))} />
                <Instructions value={i2vInstr} onChange={setI2vInstr}
                  placeholder="Agent direction: keep brass texture, moody lighting, no dialogue." />
                <div className="flex gap-3 items-center flex-wrap">
                  <RatioSwatch aspect={i2vAspect} />
                  <AspectPicker value={i2vAspect} onChange={setI2vAspect} lockedTo={urlFormat} />
                  <DurationPicker mode={i2vMode} setMode={setI2vMode} min={i2vMin} setMin={setI2vMin}
                    seconds={secondsFor(i2vMode, i2vMin)} />
                </div>
                <Go busy={busy} cost={costForTool} was={wasForTool} disabled={!i2vImg} onClick={() => run(async () => serverToolImageToVideo(
                  await token(), i2vImg!, i2vPrompt, secondsFor(i2vMode, i2vMin), i2vAspect, i2vInstr, i2vRefs.map((r) => r.dataUrl)
                ))} />
              </>
            )}

            {tool === "flow" && (
              <>
                <PromptWithRefs value={flowPrompt} onChange={setFlowPrompt} refs={flowRefs} ideas={ideasForContext ?? PROMPT_IDEAS.flow}
                  placeholder="The robot meets the flower; gentle wonder, slow orbit..." />
                <StyleChips presets={STYLE_PRESETS} value={flowPrompt} onPick={(f) => setFlowPrompt((p) => applyStyle(p, f))} />
                <Instructions value={flowInstr} onChange={setFlowInstr}
                  placeholder="Agent direction: consistent brass texture, moody lighting, no dialogue." />
                <label className="block space-y-1">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500">Voiceover (optional)</span>
                  <textarea value={flowVo} onChange={(e) => setFlowVo(e.target.value)} rows={2}
                    placeholder="In a world of scrap, one small key turns toward the light."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-xs resize-none" />
                </label>
                <FilePick label="First-frame image (optional)" accept="image/*" onDataUrl={setFlowFirstImg} preview={flowFirstImg} getToken={tokenOrPrompt} onError={setError}/>
                <RefUploader refs={flowRefs} setRefs={setFlowRefs} onUpload={(files) => handleUploadRefs(files, setFlowRefs)}
                  hint="reference images — character sheets, locations, style refs" />
                <div className="flex gap-3 items-center flex-wrap">
                  <RatioSwatch aspect={flowAspect} />
                  <AspectPicker value={flowAspect} onChange={setFlowAspect} lockedTo={urlFormat} />
                  <DurationPicker mode={flowMode} setMode={setFlowMode} min={flowMin} setMin={setFlowMin}
                    seconds={secondsFor(flowMode, flowMin)} />
                </div>
                <Go busy={busy} cost={costForTool} was={wasForTool} disabled={flowRefs.length === 0 && !flowFirstImg}
                  onClick={() => run(async () => serverToolFlowToVideo(
                    await token(), flowPrompt, flowInstr, flowVo,
                    flowFirstImg ? [flowFirstImg] : [],
                    secondsFor(flowMode, flowMin), flowAspect, flowRefs.map((r) => r.dataUrl)
                  ))} />
              </>
            )}

            {tool === "tts" && (
              <>
                <Prompt value={ttsText} onChange={setTtsText} ideas={ideasForContext ?? PROMPT_IDEAS.tts}
                  placeholder="In a world of scrap, one small key turns toward the light." accentFocus={accent.focus} onSubmit={() => (document.querySelector("[data-generate]") as HTMLButtonElement | null)?.click()}/>
                <Go busy={busy} cost={costForTool} was={wasForTool} onClick={() => run(async () => serverToolTextToSpeech(await token(), ttsText))} />
              </>
            )}

            {tool === "i2p" && (
              <>
                <FilePick label="Image to reverse-engineer" accept="image/*" onDataUrl={setI2pImg} preview={i2pImg} getToken={tokenOrPrompt} onError={setError}/>
                <Go busy={busy} cost={costForTool} was={wasForTool} disabled={!i2pImg}
                  onClick={() => run(async () => serverToolImageToPrompt(await token(), i2pImg!))} />
              </>
            )}

            {tool === "upscale" && (
              <>
                <FilePick label="Image to upscale" accept="image/*" onDataUrl={setUpscaleImg} preview={upscaleImg} getToken={tokenOrPrompt} onError={setError}/>
                <div className="flex gap-3 items-center">
                  <label className="text-xs text-zinc-500">Scale</label>
                  <Dropdown value={String(upscaleFactor)} onChange={(v) => setUpscaleFactor(parseInt(v) as 2 | 4)}
                    options={[{ value: "2", label: "2×" }, { value: "4", label: "4×" }]} />
                </div>
                <Go busy={busy} cost={costForTool} was={wasForTool} disabled={!upscaleImg}
                  onClick={() => run(async () => serverToolUpscaleImage(await token(), upscaleImg!, upscaleFactor))} />
              </>
            )}

            {tool === "text" && (
              <>
                <FilePick label="Image to caption" accept="image/*" onDataUrl={(d) => { setTextImg(d); setTextOut(null); setTextLayers([]); }} preview={null} />
                {textImg && (
                  <div className="relative rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950">
                    <img src={textOut ?? textImg} alt="canvas" className="w-full block" />
                    {textDims && (
                      <span className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/70 text-[10px] font-mono text-zinc-300">
                        {textDims.w}×{textDims.h}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    disabled={!textImg || !textDims}
                    onClick={() => setTextOpen(true)}
                    className="px-6 py-3 ws-gradient-bg text-black font-semibold text-xs uppercase tracking-widest rounded hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    {textLayers.length ? "Reopen editor" : "Open editor"}
                  </button>
                  {textOut && (
                    <DownloadButton label="Download composite"
                      onClick={() => downloadFromUri(textOut, assetFilename("textkit", textLayers.map((l) => l.text).join(" ")))} />
                  )}
                </div>
                <p className="text-[10px] font-mono text-zinc-500">
                  Runs entirely in your browser — no credits, no upload, no limit on edits.
                </p>
              </>
            )}

            {tool === "social" && (
              <>
                <div className="flex gap-3 items-center flex-wrap">
                  <label className="text-xs text-zinc-500">Platform</label>
                  <Dropdown value={socialPlatform} onChange={setSocialPlatform}
                    options={SOCIAL_PLATFORMS.map((p) => ({
                      value: p,
                      label: p.charAt(0).toUpperCase() + p.slice(1),
                      icon: <PlatformIcon platform={p} size={14} />,
                    }))} />
                </div>
                <Prompt value={socialIdea} onChange={setSocialIdea} ideas={ideasForContext ?? PROMPT_IDEAS.social}
                  placeholder="We just shipped autonomous end-to-end video production — one prompt, a finished film." accentFocus={accent.focus} onSubmit={() => (document.querySelector("[data-generate]") as HTMLButtonElement | null)?.click()}/>
                <Go busy={busy} cost={costForTool} was={wasForTool} disabled={!socialIdea.trim()}
                  onClick={() => run(async () => serverToolSocialPost(await token(), socialPlatform, socialIdea))} />
              </>
            )}

            {tool === "ytkit" && (
              <>
                <PromptWithRefs value={ytPrompt} onChange={setYtPrompt} refs={ytRefs} ideas={ideasForContext ?? PROMPT_IDEAS.ytkit}
                  placeholder="A wind-up robot's search for its owner, told in 30 seconds..." />
                <RefUploader refs={ytRefs} setRefs={setYtRefs} onUpload={(files) => handleUploadRefs(files, setYtRefs)} />
                <StyleChips presets={CHANNEL_MODES} value={ytPrompt} onPick={(f) => setYtPrompt((p) => applyStyle(p, f))} label="Channel mode" />
                <StyleChips presets={STYLE_PRESETS} value={ytPrompt} onPick={(f) => setYtPrompt((p) => applyStyle(p, f))} />
                <div className="flex gap-3 items-center flex-wrap">
                  <RatioSwatch aspect={ytAspect} />
                  <AspectPicker value={ytAspect} onChange={setYtAspect} lockedTo={urlFormat} />
                  <DurationPicker mode={ytMode} setMode={setYtMode} min={ytMin} setMin={setYtMin}
                    seconds={secondsFor(ytMode, ytMin)} />
                </div>
                <p className="text-[10px] font-mono text-zinc-500">
                  Video + a matching 1280×720 thumbnail + title/description/tags, generated together.
                </p>
                <button
                  disabled={busy || !ytPrompt.trim()}
                  onClick={async () => {
                    if (!auth.user) { auth.openAuth(); return; }
                    setBusy(true); setError(null); setYtKitResult(null); setResult(null);
                    try {
                      const r = await serverToolYouTubeKit(await token(), ytPrompt, secondsFor(ytMode, ytMin), ytAspect === "9:16" ? "9:16" : "16:9", ytRefs.map((x) => x.dataUrl));
                      setYtKitResult(r);
                    } catch (e: any) { setError(e?.message ?? "Tool failed"); }
                    finally { setBusy(false); loadCredits(); loadHistory(); }
                  }}
                  className="px-6 py-3 ws-gradient-bg text-black font-semibold text-xs uppercase tracking-widest rounded hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                  {busy ? "Generating..." : `Generate · ${costForTool} credits`}
                </button>
              </>
            )}

            {tool === "cast" && (
              <div className="space-y-6">
                <p className="text-[10px] font-mono text-zinc-500 -mt-1">
                  Build a character once — then drop them into any new scene with one click. Different scenes, same star.
                </p>

                {characters.length > 0 && (
                  <div className="space-y-2">
                    <Label>Your Cast</Label>
                    <div className="flex flex-wrap gap-3">
                      {characters.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => { setSelectedCharId(c.id); setCastSceneResult(null); }}
                          className={`group relative w-24 rounded-lg overflow-hidden border-2 transition-all ${
                            selectedCharId === c.id ? "border-fuchsia-500" : "border-zinc-800 hover:border-zinc-600"
                          }`}
                        >
                          <img src={c.sheetUri} alt={c.name} className="w-full aspect-square object-cover" />
                          <p className="text-[9px] font-mono text-center py-1 bg-zinc-950 text-zinc-300 truncate px-1">{c.name}</p>
                          <span
                            role="button"
                            onClick={(e) => { e.stopPropagation(); removeCharacter(c.id); }}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-zinc-950/90 border border-zinc-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-red-400"
                          >
                            <Trash2 size={10} />
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {selectedCharId && (
                  <div className="space-y-3 border-t border-zinc-800 pt-5">
                    <Label>New scene for {characters.find((c) => c.id === selectedCharId)?.name}</Label>
                    <Prompt value={castScenePrompt} onChange={setCastScenePrompt}
                      placeholder="Standing on a neon-lit rooftop at night, city skyline behind them" accentFocus={accent.focus} onSubmit={() => (document.querySelector("[data-generate]") as HTMLButtonElement | null)?.click()}/>
                    <button
                      disabled={castSceneBusy || !castScenePrompt.trim()}
                      onClick={generateScene}
                      className="px-6 py-3 ws-gradient-bg text-black font-semibold text-xs uppercase tracking-widest rounded hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {castSceneBusy ? "Generating..." : `Generate Scene · ${estimateCredits("image")} credits`}
                    </button>
                    {castSceneBusy && <SkeletonCard lines={1} image />}
                    {castSceneResult && (
                      <div className="space-y-2">
                        <img src={castSceneResult.uri} alt="scene" className="w-full rounded-lg border border-zinc-800" />
                        <div className="flex items-center gap-3">
                          <p className="text-[10px] font-mono text-cyan-400">{castSceneResult.credits} credits spent</p>
                          <DownloadButton label="Download image" onClick={() => downloadFromUri(castSceneResult.uri, assetFilename("cast", `${characters.find((c) => c.id === selectedCharId)?.name ?? "scene"} ${castScenePrompt}`))} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-3 border-t border-zinc-800 pt-5">
                  <Label>Create a new character · {estimateCredits("image")} cr</Label>
                  <input value={castName} onChange={(e) => setCastName(e.target.value)} placeholder="Character name"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-3 text-sm focus:outline-none focus:border-fuchsia-800" />
                  <Prompt value={castDesc} onChange={setCastDesc} ideas={ideasForContext ?? PROMPT_IDEAS.cast}
                    placeholder="A weathered space explorer in a worn amber flight suit, short silver hair, calm expression" accentFocus={accent.focus} onSubmit={() => (document.querySelector("[data-generate]") as HTMLButtonElement | null)?.click()}/>
                  <RefUploader refs={castRefs} setRefs={setCastRefs} onUpload={(files) => handleUploadRefs(files, setCastRefs)}
                    hint="optional — photos or art to match" />
                  <button
                    disabled={castCreating || !castName.trim() || !castDesc.trim()}
                    onClick={createCharacter}
                    className="px-6 py-3 border border-fuchsia-700 text-fuchsia-300 rounded text-xs font-semibold uppercase tracking-widest hover:bg-fuchsia-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {castCreating ? "Building character..." : `Create Character · ${estimateCredits("image")} credits`}
                  </button>
                  {castCreating && <SkeletonCard lines={1} image />}
                </div>
              </div>
            )}

        </section>

        {/* CANVAS — the output has its own column and stays put while you change the controls.
            Previously results appended below the form, so every generation pushed the inputs off
            screen and comparing a new result against the last one meant scrolling between them. */}
        <aside className="min-w-0">
          <div className="flex h-full flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 md:p-6">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Result</h2>
              {result?.credits != null && (
                <span className="text-[10px] font-mono tabular-nums text-zinc-600">{result.credits} credits</span>
              )}
            </div>

            <div className="flex flex-1 flex-col justify-center">

            {!busy && !result && !ytKitResult && !error && (
              examples.length > 0 ? (
                <div className="space-y-3">
                  {/* Three, not four: the grid lays out three per row, so a fourth wrapped onto a second
                      row on its own. One row is the whole point of the count rule. */}
                  <Gallery examples={examples.slice(0, 3)} onUsePrompt={usePrompt} compact />
                  <p className="text-[11px] leading-relaxed text-zinc-600">
                    {examples.some((e) => e.kind === "compare")
                      ? "Made with this tool. Drag the seam to compare."
                      : examples.some((e) => e.kind === "text")
                        ? "Made with this tool — the source, and the words it produced."
                        : "Made with this tool. Hover one to read its prompt, or click to load it."}
                  </p>
                </div>
              ) : (
                <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/[0.09] px-6 text-center">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.04] text-zinc-600">
                    <active.icon size={18} />
                  </div>
                  <p className="max-w-[26ch] text-[12px] leading-relaxed text-zinc-600">
                    {heroTagline ?? "Your result will appear here."}
                  </p>
                </div>
              )
            )}

          {busy && !result && !ytKitResult && (
            <div className="border-t border-zinc-800 pt-4">
              <SkeletonCard lines={2} image={tool !== "tts" && tool !== "i2p"} />
            </div>
          )}

          {error && (
            <p className={`text-xs font-mono p-3 rounded border ${
              error.startsWith("Insufficient credits")
                ? "text-cyan-300 bg-cyan-950/30 border-cyan-800"
                : "text-red-400 bg-red-900/20 border-red-900"
            }`}>
              ⚠ {error}
            </p>
          )}

          {result && (
            <div className="border-t border-zinc-800 pt-4 space-y-3">
              <p className="text-[10px] font-mono text-zinc-500">
                {result.provider}/{result.model} · ${result.costUSD.toFixed(3)} · <span className="text-cyan-400">{result.credits} credits spent</span>
              </p>
              {result.uri && (tool === "t2v" || tool === "i2v" || tool === "flow") && (
                <>
                  <video src={result.uri} controls className="w-full aspect-video rounded bg-zinc-950" />
                  <DownloadButton label="Download video" onClick={() => downloadFromUri(result.uri!, assetFilename(tool, promptForTool))} />
                </>
              )}
              {result.uri && (tool === "t2i" || tool === "upscale" || tool === "social") && (
                <>
                  <img src={result.uri} alt="result" className="w-full rounded bg-zinc-950" />
                  <DownloadButton label="Download image" onClick={() => downloadFromUri(result.uri!, assetFilename(tool, promptForTool))} />
                </>
              )}
              {result.uri && tool === "tts" && (
                <>
                  <audio src={result.uri} controls className="w-full" />
                  <DownloadButton label="Download audio" onClick={() => downloadFromUri(result.uri!, assetFilename("tts", ttsText))} />
                </>
              )}
              {result.text && (
                <div className="space-y-2">
                  <p className="text-sm text-zinc-300 font-mono whitespace-pre-wrap bg-zinc-950/60 border border-zinc-800 rounded p-3">{result.text}</p>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => navigator.clipboard.writeText(result.text!)}
                      className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 hover:text-cyan-300">
                      Copy prompt
                    </button>
                    <DownloadButton label="Download text" onClick={() => downloadText(result.text!, `${assetFilename(tool, result.text)}.txt`)} />
                  </div>
                </div>
              )}
            </div>
          )}

          {ytKitResult && (
            <div className="border-t border-zinc-800 pt-4 space-y-3">
              <p className="text-[10px] font-mono text-zinc-500">
                ${ytKitResult.costUSD.toFixed(3)} · <span className="text-cyan-400">{ytKitResult.credits} credits spent</span>
              </p>
              <video src={ytKitResult.videoUri} controls className="w-full aspect-video rounded bg-zinc-950" />
              <DownloadButton label="Download video" onClick={() => downloadFromUri(ytKitResult.videoUri, assetFilename("ytkit-video", ytPrompt))} />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500">Thumbnail</span>
                  <img src={ytKitResult.thumbnailUri} alt="thumbnail" className="w-full aspect-video object-cover rounded bg-zinc-950" />
                  <DownloadButton label="Download thumbnail" onClick={() => downloadFromUri(ytKitResult.thumbnailUri, assetFilename("ytkit-thumbnail", ytPrompt))} />
                </div>
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-[10px] uppercase tracking-widest text-zinc-500">Titles</span>
                    {ytKitResult.titles.map((t, i) => (
                      <p key={i} className="text-zinc-300 font-mono bg-zinc-950/60 border border-zinc-800 rounded p-2 mt-1">{t}</p>
                    ))}
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-widest text-zinc-500">Description</span>
                    <p className="text-zinc-300 font-mono bg-zinc-950/60 border border-zinc-800 rounded p-2 mt-1 whitespace-pre-wrap">{ytKitResult.description}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-widest text-zinc-500">Tags</span>
                    <p className="text-zinc-300 font-mono bg-zinc-950/60 border border-zinc-800 rounded p-2 mt-1">{ytKitResult.tags.join(", ")}</p>
                  </div>
                  <DownloadButton
                    label="Download metadata"
                    onClick={() => downloadText(
                      `Titles:\n${ytKitResult.titles.map((t) => `- ${t}`).join("\n")}\n\nDescription:\n${ytKitResult.description}\n\nTags:\n${ytKitResult.tags.join(", ")}`,
                      `worldsmith-ytkit-metadata-${Date.now()}.txt`
                    )}
                  />
                </div>
              </div>
            </div>
          )}
            </div>
          </div>
        </aside>
      </div>

        {textOpen && textImg && textDims && (
          <CreativeTextEditor
            imageUri={textImg}
            exportWidth={textDims.w}
            exportHeight={textDims.h}
            initialLayers={textLayers}
            onSave={async (dataUrl, layers) => { setTextOut(dataUrl); setTextLayers(layers); setTextOpen(false); }}
            onClose={() => setTextOpen(false)}
          />
        )}

        {/* Proof before pitch: the gallery is real output from this exact tool, so it argues the
            case that three "studio-grade output" cards used to assert. */}
        <Gallery examples={examples} onUsePrompt={usePrompt} />

        {/* On a platform page, the sizes the nav promises are the claim worth backing. */}
        {activePlatformKey && (
          <SizeShowcase
            platform={activeProfile!.label}
            examples={PLATFORM_SIZE_EXAMPLES[activePlatformKey] ?? []}
            activeFormat={urlFormat}
            onUse={(p, w, h) => { usePrompt(p); setT2iW(w); setT2iH(h); }}
          />
        )}

        {/* HOW IT WORKS — a connected sequence, not three circles floating in a void. The rail and
            the numbering encode that these steps are ordered, which the previous layout did not. */}
        {heroSteps.length > 0 && (
          <div className="mt-16">
            <h2 className="mb-6 text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">How it works</h2>
            <ol className="relative grid gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.04] sm:grid-cols-3">
              {heroSteps.map((s2, i) => (
                <li key={i} className="group relative bg-zinc-950 p-5 transition-colors hover:bg-white/[0.02]">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
                      <s2.icon size={15} />
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-zinc-700">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="mt-3 text-[13px] font-semibold text-white">{s2.title}</h3>
                  <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">{s2.desc}</p>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* WHY — the deeper case, with the claim promoted over the icon and a hairline accent so
            the three cards read as a set rather than three identical grey boxes. */}
        {heroBenefits.length > 0 && (
          <div className="mt-14">
            <h2 className="mb-6 text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
              {activeProfile ? `Built for ${activeProfile.label} creators` : "Why professionals use this"}
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {heroBenefits.map((b, i) => (
                <div
                  key={i}
                  className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 transition-colors hover:border-white/[0.16]"
                >
                  <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <b.icon size={16} className="text-cyan-400/80" />
                  <h3 className="mt-3 text-[14px] font-semibold leading-snug text-white">{b.title}</h3>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">{b.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {heroValueProps.length > 0 && (
          <div className="mt-10 flex flex-wrap justify-center gap-2">
            {heroValueProps.map((v) => (
              <span key={v} className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1.5 text-[11px] text-zinc-400">
                <CheckCircle2 size={12} className="shrink-0 text-cyan-400" /> {v}
              </span>
            ))}
          </div>
        )}

        {/* Your creations */}
        {auth.user && history.length > 0 && (
          <div className="mt-16 border-t border-white/[0.07] pt-8 space-y-3">
            <h3 className="text-xs uppercase tracking-widest text-zinc-500">Your creations</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {history.map((r) => (
                <div key={r.id} className="group bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden relative">
                  {r.kind === "image" && r.uri && <img src={r.uri} alt="" className="w-full aspect-square object-cover" />}
                  {r.kind === "video" && r.uri && <video src={r.uri} className="w-full aspect-square object-cover" muted />}
                  {r.kind === "audio" && r.uri && (
                    <div className="w-full aspect-square bg-zinc-900 flex items-center justify-center text-3xl">🗣</div>
                  )}
                  {r.kind === "text" && (
                    <div className="w-full aspect-square bg-zinc-900 flex items-center justify-center text-3xl">✍</div>
                  )}
                  {r.uri && (
                    <button
                      onClick={() => downloadFromUri(r.uri, assetFilename(r.tool, r.prompt))}
                      title="Download"
                      className="absolute inset-0 m-auto w-8 h-8 rounded-full bg-zinc-950/80 border border-zinc-700 flex items-center justify-center text-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-zinc-800"
                    >
                      <Download size={14} />
                    </button>
                  )}
                  <span className="absolute top-1 left-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-950/80 border border-zinc-800 text-zinc-300 uppercase">
                    {r.tool}
                  </span>
                  <span className="absolute bottom-1 right-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-950/80 border border-zinc-800 text-cyan-300">
                    −{r.credits}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

/* ---------- Small reusable pieces ---------- */

/** Rotating "type it, hold, delete it, type the next one" placeholder — cycles through example prompts. */

/**
 * The prompt surface.
 *
 * Was a bare textarea: a flat rectangle with nothing to tell you it was the primary control, no
 * sign that ⌘↵ would run it, and no feedback that you were writing enough. Wrapping the field
 * gives it a lit edge on focus in the tool's own hue, a footer that carries the length and the
 * shortcut, and somewhere for per-tool affordances to live inside the instrument rather than
 * floating loose beneath it.
 */
function PromptSurface({
  accentFocus, length, onSubmit, children, footer,
}: {
  accentFocus: string;
  length: number;
  onSubmit?: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); onSubmit?.(); }
      }}
      className={`group rounded-2xl border border-white/[0.09] bg-white/[0.03] transition-colors focus-within:bg-white/[0.05] focus-within:ring-1 ${accentFocus}`}
    >
      {children}
      <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-3.5 py-2">
        <div className="min-w-0 flex-1">{footer}</div>
        <span className="shrink-0 text-[10px] font-mono tabular-nums text-zinc-700">
          {length > 0 ? `${length} chars` : ""}
          {onSubmit && (
            <span className="ml-2 hidden rounded border border-white/[0.09] px-1.5 py-0.5 text-zinc-600 sm:inline">
              ⌘↵
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/** The textarea itself, borderless because PromptSurface owns the frame. */
const PROMPT_FIELD =
  "w-full min-h-[128px] resize-y bg-transparent p-4 text-[13.5px] leading-relaxed " +
  "text-zinc-100 placeholder:text-zinc-500 focus:outline-none";

function Prompt({ value, onChange, placeholder, ideas, accentFocus = "", onSubmit }: {
  value: string; onChange: (v: string) => void; placeholder: string; ideas?: string[];
  accentFocus?: string; onSubmit?: () => void;
}) {
  const animated = useTypewriterPlaceholder(ideas && ideas.length > 0 ? ideas : [placeholder], value.length === 0);
  return (
    <div className="space-y-2">
      <PromptSurface
        accentFocus={accentFocus}
        length={value.length}
        onSubmit={onSubmit}
        footer={ideas && ideas.length > 0 ? <InlineIdeas ideas={ideas} onPick={onChange} /> : null}
      >
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4} placeholder={animated}
          className={PROMPT_FIELD} />
      </PromptSurface>
    </div>
  );
}

/** Example prompts, docked inside the surface footer rather than stacked below it. */
function InlineIdeas({ ideas, onPick }: { ideas: string[]; onPick: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      <span className="shrink-0 text-[10px] font-mono uppercase tracking-widest text-zinc-700">Try</span>
      {ideas.slice(0, 3).map((idea) => (
        <button key={idea} type="button" onClick={() => onPick(idea)} title={idea}
          className="shrink-0 whitespace-nowrap rounded-full border border-white/[0.07] px-2 py-0.5 text-[10.5px] text-zinc-500 transition-colors hover:border-white/20 hover:text-zinc-200">
          {idea.split(" ").slice(0, 3).join(" ")}…
        </button>
      ))}
    </div>
  );
}

function PromptWithRefs({ value, onChange, refs, placeholder, ideas }: {
  value: string; onChange: (v: string) => void; refs: Reference[]; placeholder: string; ideas?: string[];
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Active "@partial" being typed, and where it starts — drives the autocomplete dropdown below.
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);

  const detectMention = (text: string, caret: number) => {
    const m = text.slice(0, caret).match(/@([a-zA-Z0-9_-]*)$/);
    setMention(m ? { query: m[1].toLowerCase(), start: caret - m[1].length - 1 } : null);
  };

  const insertMention = (name: string) => {
    if (!mention) return;
    const end = mention.start + 1 + mention.query.length;
    const next = `${value.slice(0, mention.start)}@${name} ${value.slice(end)}`;
    onChange(next);
    setMention(null);
    const pos = mention.start + name.length + 2;
    requestAnimationFrame(() => { textareaRef.current?.focus(); textareaRef.current?.setSelectionRange(pos, pos); });
  };

  const insertAtCursor = (name: string) => {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const needsSpace = before.length > 0 && !before.endsWith(" ") && !before.endsWith("\n");
    const insert = `${needsSpace ? " " : ""}@${name} `;
    const next = `${before}${insert}${value.slice(caret)}`;
    onChange(next);
    const pos = caret + insert.length;
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos, pos); });
  };

  const matches = mention ? refs.filter((r) => r.name.toLowerCase().startsWith(mention.query)) : [];
  const animated = useTypewriterPlaceholder(ideas && ideas.length > 0 ? ideas : [placeholder], value.length === 0);

  return (
    <div className="space-y-2">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => { onChange(e.target.value); detectMention(e.target.value, e.target.selectionStart); }}
          onKeyUp={(e) => detectMention(e.currentTarget.value, e.currentTarget.selectionStart)}
          onClick={(e) => detectMention(e.currentTarget.value, e.currentTarget.selectionStart)}
          onBlur={() => setTimeout(() => setMention(null), 150)}
          rows={3} placeholder={animated}
          className="w-full bg-zinc-950 border border-zinc-800 rounded p-3 text-sm resize-none focus:outline-none focus:border-fuchsia-800" />
        {mention && matches.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-y-auto max-h-48">
            {matches.map((r) => (
              <button key={r.id} type="button"
                onMouseDown={(e) => { e.preventDefault(); insertMention(r.name); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-800 transition-colors">
                <img src={r.dataUrl} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
                <span className="truncate">@{r.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {ideas && ideas.length > 0 && <IdeaChips ideas={ideas} onPick={onChange} />}
      {refs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {refs.map((r) => {
            const tagged = value.includes(`@${r.name}`);
            return (
              <button key={r.id} type="button" onClick={() => insertAtCursor(r.name)}
                className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono rounded border transition-colors ${
                  tagged ? "bg-fuchsia-950/40 border-fuchsia-700 text-fuchsia-300" : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                }`}>
                <img src={r.dataUrl} alt="" className="w-4 h-4 rounded object-cover" />
                @{r.name}
              </button>
            );
          })}
          <span className="text-[10px] text-zinc-500 self-center">Type @ to search references, or click a chip to insert</span>
        </div>
      )}
    </div>
  );
}

function IdeaChips({ ideas, onPick }: { ideas: string[]; onPick: (idea: string) => void }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-[10px] font-mono uppercase tracking-widest text-zinc-600">Try one</span>
      <div className="flex flex-wrap gap-1.5">
        {ideas.map((idea) => (
          <button key={idea} type="button" onClick={() => onPick(idea)} title={idea}
            className="max-w-full truncate rounded-full border border-white/[0.07] px-2.5 py-1 text-[11px] text-zinc-400 transition-colors hover:border-cyan-500/40 hover:text-cyan-300">
            {idea.split(" ").slice(0, 5).join(" ")}…
          </button>
        ))}
      </div>
    </div>
  );
}

function StyleChips({ presets, value, onPick, label = "Style" }: {
  presets: { label: string; fragment: string }[]; value: string; onPick: (fragment: string) => void; label?: string;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</span>
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const active = value.includes(p.fragment);
          return (
            <button key={p.label} type="button" onClick={() => onPick(p.fragment)}
              className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors ${
                active ? "border-cyan-700 bg-cyan-950/30 text-cyan-300" : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              }`}>
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Instructions({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-widest text-zinc-500">Agent instructions</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} placeholder={placeholder}
        className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-xs resize-none" />
    </label>
  );
}

function RefUploader({ refs, setRefs, onUpload, hint }: {
  refs: Reference[]; setRefs: (r: Reference[]) => void; onUpload: (files: FileList | null) => void; hint?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">
          References {hint && <span className="text-zinc-600 normal-case">— {hint}</span>}
        </span>
        <label className="px-2 py-1 text-[10px] font-mono uppercase tracking-widest border border-zinc-700 rounded cursor-pointer hover:bg-zinc-800">
          + Add {refs.length > 0 ? "more" : "image"}
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onUpload(e.target.files)} />
        </label>
      </div>
      {refs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {refs.map((r) => (
            <div key={r.id} className="relative group">
              <img src={r.dataUrl} alt="" className="w-16 h-16 object-cover rounded border border-zinc-800" />
              <span className="absolute bottom-0 inset-x-0 text-[9px] font-mono bg-zinc-950/90 text-center px-1 truncate border-t border-zinc-800">
                @{r.name}
              </span>
              <button
                onClick={() => setRefs(refs.filter((x) => x.id !== r.id))}
                className="absolute -top-1 -right-1 w-4 h-4 bg-zinc-900 border border-zinc-700 rounded-full text-[10px] text-zinc-400 hover:text-red-400 flex items-center justify-center">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * File input that uploads immediately and returns a stored URI.
 *
 * It used to hand the caller a base64 data URL, which then travelled into a server action and
 * blew Flight's argument-size cap for any photo over about a megabyte — every picture-taking tool
 * failed with "Maximum array nesting exceeded". Uploading here keeps the bytes off the action
 * boundary and gives the caller a short URI instead.
 */
function FilePick({ label, accept, onDataUrl, preview, getToken, onError }: {
  label: string; accept: string; onDataUrl: (d: string) => void; preview: string | null;
  /** Returns a token, or null when the visitor needs to sign in first. */
  getToken?: () => Promise<string | null>; onError?: (m: string) => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <span className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</span>
      <div className="flex items-center gap-3">
        <label className="shrink-0 px-3 py-2 text-[10px] font-mono uppercase tracking-widest border border-zinc-700 rounded cursor-pointer text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600 transition-colors">
          Choose file
          <input type="file" accept={accept} className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setFileName(f.name);
              setLocalPreview(URL.createObjectURL(f));
              if (!getToken) {   // client-only tools (TextKit) never leave the browser
                const r = new FileReader();
                r.onload = () => onDataUrl(r.result as string);
                r.readAsDataURL(f);
                return;
              }
              setUploading(true);
              try {
                const t = await getToken();
                if (!t) { setFileName(null); setLocalPreview(null); return; }  // sign-in prompted
                onDataUrl(await uploadImage(f, t));
              } catch (err: any) {
                onError?.(err?.message ?? "Upload failed");
                setFileName(null);
              } finally {
                setUploading(false);
              }
            }} />
        </label>
        <span className="text-xs text-zinc-500 truncate">{fileName ?? "No file chosen"}</span>
      </div>
      {preview && <img src={preview} alt="" className="w-24 h-24 object-cover rounded border border-zinc-800" />}
    </div>
  );
}

/** `only` narrows the list to one platform's own formats, so an Instagram page never offers a
 *  YouTube banner. Omitted, it shows the full preset list. */
function SizePicker({ w, h, onPick, only }: {
  w: number; h: number; onPick: (w: number, h: number) => void;
  only?: { label: string; w: number; h: number }[];
}) {
  const presets = only?.length
    ? only.map((o) => ({ key: `${o.w}x${o.h}`, label: o.label, w: o.w, h: o.h }))
    : SIZE_PRESETS.map((p) => ({ key: p.key, label: p.label, w: p.w, h: p.h }));
  const match = presets.find((p) => p.w === w && p.h === h);
  return (
    <Dropdown
      value={match ? match.key : "custom"}
      onChange={(key) => {
        const p = presets.find((x) => x.key === key);
        if (p) onPick(p.w, p.h);
      }}
      options={[
        ...presets.map((p) => ({ value: p.key, label: p.label, hint: `${p.w}×${p.h}` })),
        ...(!match ? [{ value: "custom", label: "Custom", hint: `${w}×${h}` }] : []),
      ]}
    />
  );
}

/**
 * Aspect ratio, locked on a named format.
 *
 * A page called "YouTube Shorts" must produce 9:16 — offering 16:9 in a dropdown means the output
 * can contradict the heading. On a format page the ratio is shown as a stated fact with the
 * format's name beside it; everywhere else it stays a free choice.
 */
function AspectPicker({ value, onChange, lockedTo }: {
  value: Aspect; onChange: (a: Aspect) => void; lockedTo?: string | null;
}) {
  if (lockedTo) {
    return (
      <span className="inline-flex items-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.03] px-3 py-2">
        <Lock size={11} className="text-zinc-600" />
        <span className="text-[11px] font-mono tabular-nums text-zinc-200">{value}</span>
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">{lockedTo}</span>
      </span>
    );
  }
  return (
    <Dropdown value={value} onChange={onChange} options={VIDEO_ASPECTS.map((a) => ({ value: a, label: a }))} />
  );
}

/** Small live preview of the selected shape — the kind of visual feedback a real design tool gives. */
function RatioSwatch({ w, h, aspect }: { w?: number; h?: number; aspect?: string }) {
  const ratio = aspect
    ? (() => { const [a, b] = aspect.split(":").map(Number); return a && b ? a / b : 1; })()
    : (w && h ? w / h : 1);
  const max = 32;
  const boxW = ratio >= 1 ? max : Math.max(10, max * ratio);
  const boxH = ratio >= 1 ? Math.max(10, max / ratio) : max;
  return (
    <div className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg border border-zinc-800 bg-zinc-950">
      <div className="border-2 border-cyan-500/70 rounded-[2px] bg-cyan-500/10" style={{ width: boxW, height: boxH }} />
    </div>
  );
}

function DurationPicker({ mode, setMode, min, setMin, seconds }: {
  mode: DurMode; setMode: (m: DurMode) => void;
  min: number; setMin: (n: number) => void; seconds: number;
}) {
  return (
    <div className="flex gap-3 items-center flex-wrap">
      <label className="text-xs text-zinc-500">Length</label>
      <Dropdown value={mode} onChange={setMode} options={[
        { value: "5", label: "5 seconds" },
        { value: "10", label: "10 seconds" },
        { value: "15", label: "15 seconds" },
        { value: "30", label: "30 seconds" },
        { value: "min", label: "Custom (1–10 min)" },
      ]} />
      {mode === "min" && (
        <div className="flex items-center gap-2">
          <input type="number" min={1} max={10} value={min}
            onChange={(e) => setMin(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))}
            className="w-20 bg-zinc-950 border border-zinc-800 rounded p-2 text-xs" />
          <span className="text-xs text-zinc-500">min (max 10)</span>
        </div>
      )}
      <span className="text-[10px] font-mono text-zinc-500">
        <span className="text-cyan-400">{estimateCredits("videoPerSecond", seconds)} credits</span>
      </span>
    </div>
  );
}

function DownloadButton({ onClick, label = "Download" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest border border-zinc-700 rounded text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600 transition-colors"
    >
      <Download size={11} /> {label}
    </button>
  );
}

/**
 * `data-generate` lets ⌘↵ inside a prompt surface fire the same action as the button.
 *
 * `was` renders a struck-through prior price. It is only ever passed a rate this product actually
 * charged before (see PREVIOUS_CREDIT_PRICES) — an invented "before" figure would be a fake
 * discount, so a tool whose price never moved simply shows one number.
 */
function Go({ busy, onClick, disabled, cost, was }: {
  busy: boolean; onClick: () => void; disabled?: boolean; cost?: number; was?: number | null;
}) {
  return (
    <div className="inline-flex w-full flex-col items-start gap-1.5 sm:w-auto">
      <button data-generate onClick={onClick} disabled={busy || disabled}
        className="ws-gradient-bg inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-xs font-semibold uppercase tracking-widest text-black transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">
        {busy && <Loader2 size={13} className="animate-spin" />}
        {busy ? "Generating…" : (
          <>
            Generate
            {cost != null && (
              <span className="flex items-baseline gap-1.5 font-mono tabular-nums">
                {was != null && <s className="text-[11px] text-black/40">{was.toLocaleString()}</s>}
                <span className="inline-flex items-center gap-1">
                  <Sparkles size={11} className="shrink-0" />
                  {cost.toLocaleString()}
                </span>
              </span>
            )}
          </>
        )}
      </button>
      {/* The saving reads as a footnote, not a second call to action. An outlined badge stacked
          above the button competed with it and repeated what the strikethrough already says. */}
      {was != null && cost != null && (
        <span className="pl-0.5 text-[10px] font-mono tabular-nums text-zinc-600">
          Down from {was.toLocaleString()} — {Math.round((1 - cost / was) * 100)}% less per second
        </span>
      )}
    </div>
  );
}