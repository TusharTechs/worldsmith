'use client';

import { useRef, useState } from "react";
import { AuthChip } from "@/components/ui/AuthChip";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { PlatformIcon, type PlatformKey } from "@/components/ui/PlatformIcon";
import { useLanguage } from "@/components/LanguageProvider";
import { WorldsmithMark } from "@/components/ui/Logo";
import {
  Compass, ImageIcon, Film, Wand2, Sparkles, Mic, Search, Maximize2, Megaphone, Play, Users,
  ChevronDown, Clapperboard,
} from "lucide-react";

/** FEATURE_NAV category labels are translated via nav.categories.* — PLATFORM_NAV labels
 * (YouTube, Instagram, ...) are brand names and stay as-is in every language. */
const CATEGORY_KEY: Record<string, string> = { Image: "image", Video: "video", Audio: "audio", Edit: "edit", Social: "social" };

type NavIcon = typeof ImageIcon;

/** Primary categories — feature-forward (icon + one-line value prop), not a flat list of links. */
const FEATURE_NAV: { label: string; items: { name: string; desc: string; icon: NavIcon; href: string }[] }[] = [
  { label: "Image", items: [
    { name: "Text → Image", desc: "Cinematic stills from a prompt", icon: ImageIcon, href: "/tools?tool=t2i" },
    { name: "Cast", desc: "Build a character, reuse it anywhere", icon: Users, href: "/tools?tool=cast" },
    { name: "Upscale Image", desc: "Clean 2×/4× upscale, in seconds", icon: Maximize2, href: "/tools?tool=upscale" },
    { name: "Image → Prompt", desc: "Reverse-engineer any image", icon: Search, href: "/tools?tool=i2p" },
  ]},
  { label: "Video", items: [
    { name: "Text → Video", desc: "Veo-powered clips from a prompt", icon: Film, href: "/tools?tool=t2v" },
    { name: "Image → Video", desc: "Animate any still", icon: Wand2, href: "/tools?tool=i2v" },
    { name: "Voiceover + Images → Video", desc: "Narration + refs → finished clip", icon: Sparkles, href: "/tools?tool=flow" },
    { name: "YouTube Kit", desc: "Video + thumbnail + metadata, together", icon: Play, href: "/tools?tool=ytkit" },
  ]},
  { label: "Audio", items: [
    { name: "Text → Speech", desc: "Gemini narration, pace-matched to your cut", icon: Mic, href: "/tools?tool=tts" },
  ]},
  { label: "Edit", items: [
    { name: "Creative Text Editor", desc: "Titles and captions on any creative", icon: Wand2, href: "/tools?tool=text" },
    { name: "Upscale Image", desc: "Clean 2×/4× upscale, in seconds", icon: Maximize2, href: "/tools?tool=upscale" },
    { name: "Image → Prompt", desc: "Reverse-engineer any image", icon: Search, href: "/tools?tool=i2p" },
  ]},
  { label: "Social", items: [
    { name: "Social Post", desc: "One idea → copy + image, any platform", icon: Megaphone, href: "/tools?tool=social" },
    { name: "YouTube Kit", desc: "Video + thumbnail + metadata", icon: Play, href: "/tools?tool=ytkit" },
    { name: "Cast", desc: "One consistent character, every post", icon: Users, href: "/tools?tool=cast" },
  ]},
];

/** Platform categories — quick on-spec asset sizes. Distinct purpose from FEATURE_NAV: exact dimensions, not feature discovery. */
interface PlatformNavItem { name: string; href: string; kind: "image" | "video" }

/** Builds a deep link that carries `platform` + `format` so the tool page can show that
 *  platform's own identity (icon, gradient, copy) instead of the generic tool page. */
function platformLink(base: string, platform: PlatformKey, format: string): string {
  return `${base}&platform=${platform}&format=${encodeURIComponent(format)}`;
}

const PLATFORM_NAV: { label: string; platform: PlatformKey; items: PlatformNavItem[] }[] = [
  { label: "YouTube", platform: "youtube", items: [
    { name: "Video · 16:9 · 1920×1080", href: platformLink("/tools?tool=t2v&ar=16:9", "youtube", "Video"), kind: "video" },
    { name: "Shorts · 9:16 · 1080×1920", href: platformLink("/tools?tool=t2v&ar=9:16", "youtube", "Shorts"), kind: "video" },
    { name: "Thumbnail · 16:9 · 1280×720", href: platformLink("/tools?tool=t2i&w=1280&h=720", "youtube", "Thumbnail"), kind: "image" },
    { name: "Channel banner · 2560×1440", href: platformLink("/tools?tool=t2i&w=2560&h=1440", "youtube", "Channel Banner"), kind: "image" },
    { name: "Avatar · 1:1 · 800×800", href: platformLink("/tools?tool=t2i&w=800&h=800", "youtube", "Avatar"), kind: "image" },
  ]},
  { label: "Instagram", platform: "instagram", items: [
    { name: "Reel · 9:16 · 1080×1920", href: platformLink("/tools?tool=t2v&ar=9:16", "instagram", "Reel"), kind: "video" },
    { name: "Story · 9:16 · 1080×1920", href: platformLink("/tools?tool=t2i&w=1080&h=1920", "instagram", "Story"), kind: "image" },
    { name: "Post · 1:1 · 1080×1080", href: platformLink("/tools?tool=t2i&w=1080&h=1080", "instagram", "Post"), kind: "image" },
    { name: "Post · 4:5 · 1080×1350", href: platformLink("/tools?tool=t2i&w=1080&h=1350", "instagram", "Portrait Post"), kind: "image" },
    { name: "Profile photo · 320×320", href: platformLink("/tools?tool=t2i&w=320&h=320", "instagram", "Profile Photo"), kind: "image" },
  ]},
  { label: "TikTok", platform: "tiktok", items: [
    { name: "Video · 9:16 · 1080×1920", href: platformLink("/tools?tool=t2v&ar=9:16", "tiktok", "Video"), kind: "video" },
    { name: "Cover · 9:16 · 1080×1920", href: platformLink("/tools?tool=t2i&w=1080&h=1920", "tiktok", "Cover"), kind: "image" },
    { name: "Profile photo · 200×200", href: platformLink("/tools?tool=t2i&w=200&h=200", "tiktok", "Profile Photo"), kind: "image" },
  ]},
  { label: "Pinterest", platform: "pinterest", items: [
    { name: "Pin · 2:3 · 1000×1500", href: platformLink("/tools?tool=t2i&w=1000&h=1500", "pinterest", "Pin"), kind: "image" },
    { name: "Square pin · 1000×1000", href: platformLink("/tools?tool=t2i&w=1000&h=1000", "pinterest", "Square Pin"), kind: "image" },
    { name: "Long pin · 1:2 · 1000×2100", href: platformLink("/tools?tool=t2i&w=1000&h=2100", "pinterest", "Long Pin"), kind: "image" },
  ]},
  { label: "X", platform: "x", items: [
    { name: "Post image · 16:9 · 1600×900", href: platformLink("/tools?tool=t2i&w=1600&h=900", "x", "Post Image"), kind: "image" },
    { name: "Card image · 1200×628", href: platformLink("/tools?tool=t2i&w=1200&h=628", "x", "Card Image"), kind: "image" },
    { name: "Header · 3:1 · 1500×500", href: platformLink("/tools?tool=t2i&w=1500&h=500", "x", "Header"), kind: "image" },
    { name: "Profile photo · 400×400", href: platformLink("/tools?tool=t2i&w=400&h=400", "x", "Profile Photo"), kind: "image" },
  ]},
  { label: "LinkedIn", platform: "linkedin", items: [
    { name: "Post · 1.91:1 · 1200×627", href: platformLink("/tools?tool=t2i&w=1200&h=627", "linkedin", "Post"), kind: "image" },
    { name: "Post · 4:5 · 1080×1350", href: platformLink("/tools?tool=t2i&w=1080&h=1350", "linkedin", "Portrait Post"), kind: "image" },
    { name: "Cover · 4:1 · 1584×396", href: platformLink("/tools?tool=t2i&w=1584&h=396", "linkedin", "Cover"), kind: "image" },
    { name: "Company banner · 1128×191", href: platformLink("/tools?tool=t2i&w=1128&h=191", "linkedin", "Company Banner"), kind: "image" },
  ]},
];

/**
 * Shared top nav — used on the landing page AND every tool page, so switching tools never
 * needs a persistent sidebar of "other tools": hover Image/Video/etc. from anywhere.
 */
export function SiteHeader({ credits, plan, showcaseHref = "/#showcase" }: { credits?: number | null; plan?: string; showcaseHref?: string }) {
  const { t } = useLanguage();
  const catLabel = (label: string) => (CATEGORY_KEY[label] ? t(`nav.categories.${CATEGORY_KEY[label]}`) : label);
  const [navOpen, setNavOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ label: string; x: number; y: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openMenu = (label: string, el: HTMLElement) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const r = el.getBoundingClientRect();
    setMenu({ label, x: r.left, y: r.bottom });
  };
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setMenu(null), 180);
  };
  const cancelClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };

  return (
    <header className="fixed top-0 inset-x-0 z-40 backdrop-blur-md bg-zinc-950/70 border-b border-zinc-800/60">
      <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center gap-6">
        <a href="/" className="flex items-center gap-2.5 text-xl font-light tracking-widest text-zinc-400 shrink-0 group">
          <WorldsmithMark size={26} className="shrink-0 transition-transform duration-500 group-hover:rotate-[135deg]" title="Worldsmith" />
          <span className="hidden sm:inline">WORLD<span className="ws-gradient-text font-semibold">SMITH</span></span>
        </a>

        <nav className="hidden md:block flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="inline-flex items-center gap-6 text-[11px] uppercase tracking-widest text-zinc-400 whitespace-nowrap py-2">
            <a href="/" className="flex items-center gap-1.5 hover:text-white transition-colors">
              <Compass size={13} /> {t("nav.explore")}
            </a>
            {[...FEATURE_NAV, ...PLATFORM_NAV].map((c) => (
              <button
                key={c.label}
                onMouseEnter={(e) => openMenu(c.label, e.currentTarget)}
                onMouseLeave={scheduleClose}
                onClick={(e) => openMenu(c.label, e.currentTarget)}
                className={`flex items-center gap-1 transition-colors ${menu?.label === c.label ? "text-white" : "hover:text-white"}`}
              >
                {catLabel(c.label)} <ChevronDown size={12} className={`transition-transform ${menu?.label === c.label ? "rotate-180" : ""}`} />
              </button>
            ))}
            <a href={showcaseHref} className="hover:text-white transition-colors">{t("nav.showcase")}</a>
          </div>
        </nav>

        <button
          onClick={() => setNavOpen((v) => !v)}
          className="md:hidden ml-auto text-zinc-400 hover:text-white text-xs font-mono uppercase tracking-widest border border-zinc-800 rounded px-3 py-1.5"
        >
          {navOpen ? "Close" : "Menu"}
        </button>

        <div className="hidden md:flex items-center gap-3 shrink-0">
          <CommandPalette />
          <a href="/#pricing" className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 hover:text-white">{t("home.footer.links.pricing")}</a>
          <a href="/studio" className="px-4 py-2 bg-white text-black font-semibold text-xs uppercase tracking-widest rounded hover:bg-zinc-200 transition-colors">{t("billingSuccess.openStudio")}</a>
          <AuthChip credits={credits} plan={plan} />
        </div>
      </div>

      {/* Mobile menu — accordion, since a hover mega-menu doesn't work under ~768px */}
      {navOpen && (
        <div className="md:hidden border-t border-zinc-800/60 bg-zinc-950/95 max-h-[75vh] overflow-y-auto">
          <div className="px-4 py-3 flex items-center justify-between border-b border-zinc-800/60">
            <AuthChip credits={credits} plan={plan} />
          </div>
          <a href="/" className="flex items-center gap-2 px-4 py-3 text-xs uppercase tracking-widest text-zinc-300 border-b border-zinc-800/60">
            <Compass size={14} /> {t("nav.explore")}
          </a>
          {[...FEATURE_NAV, ...PLATFORM_NAV].map((c) => (
            <div key={c.label} className="border-b border-zinc-800/60">
              <button
                onClick={() => setMobileSection(mobileSection === c.label ? null : c.label)}
                className="w-full flex justify-between items-center px-4 py-3 text-xs uppercase tracking-widest text-zinc-300"
              >
                {catLabel(c.label)}
                <span className={`transition-transform ${mobileSection === c.label ? "rotate-45" : ""}`}>+</span>
              </button>
              {mobileSection === c.label && (
                <div className="pb-2">
                  {c.items.map((it) => (
                    <a key={it.name} href={it.href} className="block px-6 py-2 text-xs text-zinc-400 hover:text-white">{it.name}</a>
                  ))}
                </div>
              )}
            </div>
          ))}
          <a href={showcaseHref} className="block px-4 py-3 text-xs uppercase tracking-widest text-zinc-300 border-b border-zinc-800/60">{t("nav.showcase")}</a>
          <a href="/studio" className="block m-4 px-4 py-3 bg-white text-black text-center font-semibold text-xs uppercase tracking-widest rounded">{t("billingSuccess.openStudio")}</a>
        </div>
      )}

      {/* Dropdown rendered OUTSIDE the scroll container → never clipped. Hover-triggered:
          stays open while the cursor is over either the trigger or the panel itself. */}
      {menu && (
        <div
          className="fixed w-80 max-h-[70vh] overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-xl p-2 shadow-2xl z-50 normal-case fade-in"
          style={{ left: Math.max(8, Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 320)), top: menu.y + 6 }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          {FEATURE_NAV.find((c) => c.label === menu.label)?.items.map((it) => (
            <a key={it.name} href={it.href} onClick={() => setMenu(null)}
              className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800 transition-colors">
              <span className="mt-0.5 w-7 h-7 shrink-0 rounded-lg bg-zinc-800 flex items-center justify-center text-cyan-400">
                <it.icon size={14} />
              </span>
              <span>
                <span className="block text-xs text-white font-medium">{it.name}</span>
                <span className="block text-[11px] text-zinc-500 normal-case mt-0.5">{it.desc}</span>
              </span>
            </a>
          ))}
          {PLATFORM_NAV.find((c) => c.label === menu.label) && (
            <>
              <div className="flex items-center gap-2 px-3 py-2 text-[10px] uppercase tracking-widest text-zinc-500">
                <PlatformIcon platform={PLATFORM_NAV.find((c) => c.label === menu.label)!.platform} size={13} />
                {menu.label} sizes
              </div>
              {PLATFORM_NAV.find((c) => c.label === menu.label)!.items.map((it) => (
                <a key={it.name} href={it.href} onClick={() => setMenu(null)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-800 text-xs text-zinc-300 transition-colors">
                  {it.kind === "video" ? <Clapperboard size={13} className="text-fuchsia-400 shrink-0" /> : <ImageIcon size={13} className="text-cyan-400 shrink-0" />}
                  {it.name}
                </a>
              ))}
            </>
          )}
        </div>
      )}
    </header>
  );
}
