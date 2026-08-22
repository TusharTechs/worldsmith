'use client';

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { serverStartCheckout, serverClaimPurchase, serverGetCredits, CheckoutItem, ClaimResult } from "@/app/actions/billing";
import { sendEmailVerification } from "firebase/auth";
import { Modal, ModalHeader } from "@/components/ui/Modal";
import { PACKS } from "@/core/credits";
import type { Dictionary } from "@/i18n/dictionary";
import { SiteHeader } from "@/components/SiteHeader";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { WorldsmithMark } from "@/components/ui/Logo";
import { RedeemCode } from "@/components/ui/RedeemCode";
import { Gift, CheckCircle2, MailWarning, SearchX, Check, Minus, ChevronDown } from "lucide-react";

// Matches home.exploreMore.tags index-for-index (dictionary.ts) — each tag deep-links to its
// actual tool/platform page instead of the generic /tools index.
const EXPLORE_TAG_HREFS = [
  "/studio",                                                                          // Autonomous Studio
  "/tools?tool=cast",                                                                 // Cast — Character Consistency
  "/tools?tool=social",                                                               // Social Post
  "/tools?tool=ytkit",                                                                // YouTube Kit
  "/tools?tool=t2i",                                                                  // Text → Image
  "/tools?tool=t2v",                                                                  // Text → Video
  "/tools?tool=i2v",                                                                  // Image → Video
  "/tools?tool=flow",                                                                 // Voiceover + Images → Video
  "/tools?tool=tts",                                                                  // Text → Speech
  "/tools?tool=i2p",                                                                  // Image → Prompt
  "/tools?tool=upscale",                                                              // Upscale Image
  "/studio?tab=story",                                                                // World Bible
  "/studio?tab=assets",                                                               // Continuity QC
  "/tools?tool=text",                                                                 // Creative Text Editor
  "/studio?tab=distribute",                                                           // 8-Platform Distribution
  "/tools?tool=t2i&w=1280&h=720&platform=youtube&format=Thumbnail",                   // YouTube Thumbnails
  "/tools?tool=t2v&ar=9:16&platform=instagram&format=Reel",                           // Instagram Reels
  "/tools?tool=t2i&w=1080&h=1920&platform=tiktok&format=Cover",                       // TikTok Covers
  "/tools?tool=t2i&w=1000&h=1500&platform=pinterest&format=Pin",                      // Pinterest Pins
  "/tools?tool=t2i&w=1200&h=628&platform=x&format=Card%20Image",                      // X Cards
  "/tools?tool=t2i&w=1200&h=627&platform=linkedin&format=Post",                       // LinkedIn Posts
] as const;

// Real Worldsmith-generated stills and clips — proof of what the pipeline actually produces,
// not stock photography. Regenerate via the Toolbox if these ever need refreshing.
const SHOWCASE_IMAGES = [
  { uri: "/showcase/img-1787373545938-1hgs1o.webp", big: true },  // streetwear "BOOM" poster
  { uri: "/showcase/img-1787373951295-f9bpoo.webp" },              // gig-poster w/ headline text
  { uri: "/showcase/img-1787373617931-lrl8en.webp" },              // ceramics product card
  { uri: "/showcase/img-1787373653234-qbvsmi.webp" },              // furniture ad w/ tagline
  { uri: "/showcase/img-1787373685320-zcktv5.webp" },              // anime sports cover
  { uri: "/showcase/img-1787373713661-q952om.webp" },              // macro nature photography
  { uri: "/showcase/img-1787373745955-9set56.webp", big: true },  // fantasy concept art
  { uri: "/showcase/img-1787373775462-8er86c.webp" },              // editorial fashion portrait
  { uri: "/showcase/img-1787375224171-okg7ut.webp" },              // tech product ad w/ text
  { uri: "/showcase/img-1787375156952-rue6wi.webp" },              // food photography
] as const;

const SHOWCASE_VIDEOS = [
  "/showcase/vid-1787374077992-3l6bin.mp4", // golden-hour skateboard tracking shot
  "/showcase/vid-1787374178740-d2ulgs.mp4", // misty forest drone rise
] as const;

// One coherent production — the "Cogsworth" short — so the claim that these all came out of a
// single pipeline run actually reads as true: same character design across the sheet, the stills
// and the film. Replaces the earlier mock assets, which were muddy and off-model from each other.
const SHOWCASE_META = [
  { type: "video", uri: "/showcase/vid-1787380605932-wc0u9d.mp4" }, // final film
  { type: "image", uri: "/showcase/img-1787380256135-vwb27a.webp" }, // character turnaround
  { type: "image", uri: "/showcase/img-1787380381409-xxs0c4.webp" }, // cavern wide
  { type: "image", uri: "/showcase/img-1787380285231-24u4hu.webp" }, // environment plate
  { type: "image", uri: "/showcase/img-1787380473621-tlzvsu.webp" }, // close-up, on-model
  { type: "image", uri: "/showcase/img-1787380324434-ut24u9.webp" }, // hero shot
] as const;

const STEP_NUMBERS = ["01", "02", "03", "04", "05", "06"];

// Plan tier names (Creator/Studio/Agency) stay in English everywhere — `id` drives billing
// logic and must never be translated; only the displayed label (looked up via PLAN_NAME_KEY) is.
const PLANS = [
  { id: "creator", m: 19, a: 15, credits: "1,200", perkKeys: ["prodCreator", "allTools", "continuityQc", "campaign8"], hot: false },
  { id: "studio", m: 49, a: 39, credits: "3,300", perkKeys: ["everythingCreator", "prodStudio", "prod30", "creditsRoll"], hot: true },
  { id: "agency", m: 119, a: 95, credits: "8,200", perkKeys: ["everythingStudio", "prodAgency", "prod30x4"], hot: false },
] as const;
const PLAN_NAME: Record<string, string> = { creator: "Creator", studio: "Studio", agency: "Agency" };

const PLAN_ORDER = ["creator", "studio", "agency"];


/** next/image (auto-resized + compressed, instead of shipping the full source PNG into a small
 * grid tile) with a fade-in on load so the tile reads as "loading", not "broken/blank". */
function FadeImage({ src, sizes, priority, className = "" }: { src: string; sizes: string; priority?: boolean; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <Image
      src={src}
      alt=""
      fill
      sizes={sizes}
      priority={priority}
      onLoad={() => setLoaded(true)}
      className={`object-cover transition-all duration-500 ${loaded ? "opacity-100 blur-0" : "opacity-0 blur-sm"} ${className}`}
    />
  );
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ${on ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
      {children}
    </div>
  );
}

export default function Landing() {
  const { t, td } = useLanguage();
  const [annual, setAnnual] = useState(true);
  const auth = useAuth();
  const [acct, setAcct] = useState<{ credits: number; plan: string } | null>(null);
  const [claimResult, setClaimResult] = useState<ClaimResult | null>(null);
  const [claimBusy, setClaimBusy] = useState(false);
  const [verifySent, setVerifySent] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const loadAcct = async () => {
    if (!auth.user) { setAcct(null); return; }
    try { const t = await auth.user.getIdToken(); await serverClaimPurchase(t).catch(() => {}); }
    catch (e) { console.error("[landing] claim failed:", e); }
    try { const t = await auth.user.getIdToken(); setAcct(await serverGetCredits(t)); }
    catch (e) { console.error("[landing] getCredits failed:", e); }
  };

  useEffect(() => { loadAcct(); }, [auth.user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const buy = async (item: CheckoutItem) => {
    if (!auth.user) { auth.openAuth(); return; }
    try {
      const t = await auth.user.getIdToken();
      const { url } = await serverStartCheckout(t, item);
      window.location.href = url;
    } catch (e: any) {
      alert(e?.message ?? "Checkout failed to start.");
    }
  };

  const claim = async () => {
    if (!auth.user) { auth.openAuth(); return; }
    setClaimBusy(true);
    try {
      // Force-refresh the token so a just-completed email verification is reflected server-side.
      const t = await auth.user.getIdToken(true);
      const r = await serverClaimPurchase(t);
      setClaimResult(r);
      if (r.granted) loadAcct();
    } catch (e: any) {
      setClaimResult({ granted: null, reason: "no-match", email: auth.user.email ?? "", detail: e?.message ?? "Claim failed." });
    } finally {
      setClaimBusy(false);
    }
  };

  const resendVerification = async () => {
    if (!auth.user) return;
    setVerifySent("sending");
    try { await sendEmailVerification(auth.user); setVerifySent("sent"); }
    catch { setVerifySent("error"); }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      <SiteHeader credits={acct?.credits} plan={acct?.plan} />

      {/* HERO */}
      <section className="relative min-h-[92vh] flex items-center overflow-hidden">
        <div className="ws-mesh pointer-events-none" />
        <div className="absolute inset-0 ws-grain pointer-events-none" />
        {/* Abstract molten-metal plasma in the brand's cyan→violet, generated by Worldsmith itself.
            Replaces the old scrapyard clip: that was a scene from the demo film, so it competed with
            the headline and said nothing about the product. This reads as atmosphere, not content. */}
        <video src="/showcase/vid-1787379851902-9jlkz4.mp4" autoPlay muted loop playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/70 via-zinc-950/50 to-zinc-950" />
        <div className="relative max-w-6xl mx-auto px-6 pt-24 pb-16">
          <p className="text-xs font-mono uppercase tracking-[0.3em] ws-gradient-text mb-6">{t("home.hero.kicker")}</p>
          <h1 className="text-5xl md:text-7xl font-light leading-[1.05] tracking-tight max-w-4xl">
            {t("home.hero.titlePre")}<span className="font-semibold text-white">{t("home.hero.titleStrong")}</span>
          </h1>
          <p className="mt-6 text-zinc-400 max-w-2xl text-lg">
            {t("home.hero.subtitle")}
          </p>
          {/* Stacked and equal-width on mobile — ragged auto-widths read as an accident when the
              buttons sit on top of each other. Side-by-side, content-width from sm up. */}
          <div className="mt-10 flex flex-col sm:flex-row sm:flex-wrap gap-4 items-stretch sm:items-start">
            <a href="/studio" className="w-full sm:w-auto text-center px-8 py-4 bg-white text-black font-semibold text-sm uppercase tracking-widest rounded hover:bg-zinc-200 transition-colors">{t("home.hero.ctaPrimary")}</a>
            <a href="#showcase" className="w-full sm:w-auto text-center px-8 py-4 border border-zinc-700 text-sm uppercase tracking-widest rounded hover:border-zinc-500 transition-colors">{t("home.hero.ctaSecondary")}</a>
          </div>

          {/* Launch offer, above the fold — the strongest lever on a cold homepage, and it was
              previously buried at the bottom of the pricing section. */}
          <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-400">
            <Gift size={13} className="text-cyan-400 shrink-0" />
            <span>{t("home.hero.offerPre")}</span>
            <a href="#pricing" className="font-mono font-semibold tracking-widest ws-gradient-text hover:brightness-125 underline decoration-dotted underline-offset-4">FORGE20</a>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">{t("home.hero.offerPost")}</span>
          </p>
          <div className="mt-14 grid grid-cols-3 max-w-lg gap-6 text-center">
            {/* Every figure here is checkable against the product: 10 entries in TOOLS,
                8 platforms in the distribution package, and VLM QC runs on every asset.
                The old "$0.00 hidden generation costs" read as "this is worthless" at a glance. */}
            {/* "100% assets continuity-QC'd" was not true: QC runs on shot first frames (Stage A, before
                the expensive render) and on the rendered clips (Stage B) — character sheets, location
                plates and props are generated without a QC pass. Two checks per shot is the claim the
                pipeline actually backs, and it drops an abbreviation no visitor can parse. */}
            {[["11", t("home.hero.statTools")], ["8", t("home.hero.statPlatforms")], ["2\u00d7", t("home.hero.stat2")]].map(([n, l]) => (
              <div key={l}>
                <p className="text-2xl font-mono ws-gradient-text">{n}</p>
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 mt-1">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* POWERED BY */}
      <div className="border-y border-zinc-800/60 py-4">
        <p className="text-center text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-500">
          {t("home.poweredBy")}
        </p>
      </div>

      {/* AI SHOWCASE — real generations, not stock photography: proof the pipeline actually
          produces studio-grade stills (with clean text rendering) and cinematic clips. */}
      <section className="max-w-6xl mx-auto px-6 py-28">
        <Reveal>
          <p className="text-[10px] font-mono uppercase tracking-[0.25em] ws-gradient-text mb-3">{t("home.showcaseGrid.imagesKicker")}</p>
          <h2 className="text-3xl md:text-4xl font-light tracking-tight">{t("home.showcaseGrid.imagesHeadingPre")}<span className="font-semibold text-white">{t("home.showcaseGrid.imagesHeadingStrong")}</span></h2>
          <p className="text-zinc-400 mt-3 max-w-2xl">{t("home.showcaseGrid.imagesSubtitle")}</p>
        </Reveal>
        <Reveal delay={100}>
          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-3 [grid-auto-flow:dense]">
            {SHOWCASE_IMAGES.map((img, i) => {
              const big = "big" in img && img.big;
              return (
                <a
                  key={img.uri}
                  href="/tools?tool=t2i"
                  className={`group relative block rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-colors bg-zinc-900 ${
                    big ? "col-span-2 aspect-[2/1]" : "aspect-square"
                  }`}
                >
                  <FadeImage
                    src={img.uri}
                    sizes={big ? "(max-width: 768px) 100vw, 50vw" : "(max-width: 768px) 50vw, 25vw"}
                    priority={i < 3}
                    className="group-hover:scale-105"
                  />
                </a>
              );
            })}
          </div>
        </Reveal>

        <div className="mt-24">
          <Reveal>
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] ws-gradient-text mb-3">{t("home.showcaseGrid.videosKicker")}</p>
            <h2 className="text-3xl md:text-4xl font-light tracking-tight">{t("home.showcaseGrid.videosHeadingPre")}<span className="font-semibold text-white">{t("home.showcaseGrid.videosHeadingStrong")}</span></h2>
            <p className="text-zinc-400 mt-3 max-w-2xl">{t("home.showcaseGrid.videosSubtitle")}</p>
          </Reveal>
          <Reveal delay={100}>
            <div className="mt-10 grid md:grid-cols-2 gap-4">
              {SHOWCASE_VIDEOS.map((uri) => (
                <a key={uri} href="/tools?tool=t2v" className="block rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-colors">
                  <video src={uri} muted loop autoPlay playsInline preload="metadata" className="w-full aspect-video object-cover" />
                </a>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* PIPELINE */}
      <section id="pipeline" className="max-w-6xl mx-auto px-6 py-28">
        <Reveal>
          <h2 className="text-3xl md:text-4xl font-light tracking-tight">{t("home.pipeline.headingPre")}<span className="font-semibold text-white">{t("home.pipeline.headingStrong")}</span></h2>
          <p className="text-zinc-400 mt-3 max-w-2xl">{t("home.pipeline.subtitle")}</p>
        </Reveal>
        <div className="mt-14 grid md:grid-cols-3 gap-4">
          {td<Dictionary["home"]["pipeline"]["steps"]>("home.pipeline.steps").map((step, i) => (
            <Reveal key={step.label} delay={i * 80}>
              <Card className="h-full hover:border-cyan-800 transition-colors">
                <p className="text-[10px] font-mono text-cyan-400">{STEP_NUMBERS[i]}</p>
                <h3 className="mt-2 text-sm font-semibold uppercase tracking-widest text-white">{step.label}</h3>
                <p className="mt-2 text-sm text-zinc-400">{step.desc}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      {/* SHOWCASE — auto-scrolling marquee, hover to pause */}
      <section id="showcase" className="py-28 border-y border-zinc-800/60 bg-zinc-900/20">
        <div className="max-w-6xl mx-auto px-6">
          <Reveal>
            <h2 className="text-3xl font-light tracking-tight">{t("home.showcase.headingPre")}<span className="font-semibold text-white">{t("home.showcase.headingStrong")}</span></h2>
            <p className="text-zinc-400 mt-3 max-w-2xl">{t("home.showcase.subtitle")}</p>
          </Reveal>
        </div>
        <div className="ws-marquee-row mt-12 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
          <div className="ws-marquee-track flex gap-4 w-max px-6">
            {(() => {
              const labels = td<readonly string[]>("home.showcase.items");
              const showcase = SHOWCASE_META.map((s, i) => ({ ...s, label: labels[i] }));
              return [...showcase, ...showcase].map((s, i) => (
                <div key={i} className="group relative w-80 shrink-0 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900">
                  {/* Video autoplays: the clip opens on a near-black frame, so a static poster
                      reads as a broken tile. Motion also matches the showcase grid above. */}
                  {s.type === "video" ? (
                    <video src={s.uri} muted loop autoPlay playsInline preload="metadata" className="w-full aspect-video object-cover" />
                  ) : (
                    <img src={s.uri} alt={s.label} className="w-full aspect-video object-cover group-hover:scale-[1.03] transition-transform duration-500" />
                  )}
                  <p className="pointer-events-none absolute bottom-0 inset-x-0 bg-gradient-to-t from-zinc-950 to-transparent px-4 pt-8 pb-3 text-[10px] font-mono uppercase tracking-widest text-zinc-300">{s.label}</p>
                </div>
              ));
            })()}
          </div>
        </div>
      </section>

      {/* FLAGSHIP FEATURES — a few full features shown properly, not a grid of every tool */}
      <section className="border-b border-zinc-800/60">
        <div className="max-w-6xl mx-auto px-6 py-28">
          <Reveal>
            <h2 className="text-3xl font-light tracking-tight">{t("home.flagship.headingPre")}<span className="font-semibold text-white">{t("home.flagship.headingStrong")}</span></h2>
            <p className="text-zinc-400 mt-3 max-w-2xl">{t("home.flagship.subtitle")}</p>
          </Reveal>
          <div className="mt-12 grid md:grid-cols-2 gap-4">
            {[
              // Composed for this card: deep shadow across the lower-left where the copy sits, one
              // warm focal point on the right. The previous still was uniformly dark and read as a
              // failed image load rather than a background.
              { href: "/studio", bg: "/showcase/img-1787382878414-bqj8iv.webp", mesh: "from-cyan-950/80 via-zinc-950/70 to-zinc-950" },
              { href: "/tools?tool=cast", mesh: "from-fuchsia-950/80 via-zinc-950/80 to-zinc-950" },
              { href: "/tools?tool=social", mesh: "from-emerald-950/80 via-zinc-950/80 to-zinc-950" },
              { href: "/tools?tool=ytkit", mesh: "from-amber-950/80 via-zinc-950/80 to-zinc-950" },
            ].map((f, i) => {
              const copy = td<Dictionary["home"]["flagship"]["items"]>("home.flagship.items")[i];
              return (
                <Reveal key={f.href} delay={i * 70}>
                  <a href={f.href} className={`group relative block h-64 rounded-2xl overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-colors`}>
                    {f.bg && (
                      <img src={f.bg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-60 group-hover:scale-105 transition-all duration-500" />
                    )}
                    <div className={`absolute inset-0 bg-gradient-to-t ${f.mesh}`} />
                    <div className="relative h-full flex flex-col justify-end p-6">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 mb-1">{copy.tag}</span>
                      <h3 className="text-2xl font-semibold text-white">{copy.title}</h3>
                      <p className="mt-2 text-sm text-zinc-300 max-w-md">{copy.desc}</p>
                      <span className="mt-4 text-[10px] font-mono uppercase tracking-widest text-white/80 group-hover:text-white">{t("home.flagship.open")}</span>
                    </div>
                  </a>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* VS */}
      <section className="max-w-6xl mx-auto px-6 py-28">
        <Reveal>
          <h2 className="text-3xl font-light tracking-tight">{t("home.vs.heading")}</h2>
          <p className="mt-3 max-w-xl text-sm text-zinc-400">{t("home.vs.caption")}</p>
        </Reveal>
        <Reveal delay={100}>
          {/* The Worldsmith column carries a tinted rail down the whole table so the comparison
              reads before a single row does. Marks are icons rather than ✓/✗ glyphs, which sat at
              different baselines and weights than everything else on the page. */}
          <div className="mt-10 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                  <th className="py-3 pr-6 font-normal">{t("home.vs.capability")}</th>
                  <th className="w-36 rounded-t-xl bg-white/[0.04] py-3 text-center font-normal text-white">
                    {t("home.vs.worldsmith")}
                  </th>
                  <th className="w-44 py-3 text-center font-normal">{t("home.vs.typical")}</th>
                </tr>
              </thead>
              <tbody>
                {td<readonly string[]>("home.vs.rows").map((cap, i, arr) => (
                  <tr key={cap} className="group">
                    <td className="border-t border-white/[0.06] py-3.5 pr-6 text-zinc-300 transition-colors group-hover:text-white">
                      {cap}
                    </td>
                    <td className={`border-t border-white/[0.06] bg-white/[0.04] py-3.5 ${i === arr.length - 1 ? "rounded-b-xl" : ""}`}>
                      <span className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                        <Check size={13} strokeWidth={3} />
                      </span>
                    </td>
                    <td className="border-t border-white/[0.06] py-3.5">
                      {/* A dash, not a cross: a single call does not attempt these, which is a
                          difference in scope rather than a failure. */}
                      <span className="mx-auto flex h-6 w-6 items-center justify-center text-zinc-700">
                        <Minus size={13} strokeWidth={3} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </section>

      {/* PRICING */}
      <section id="pricing" className="border-t border-zinc-800/60 bg-zinc-900/30">
        <div className="max-w-6xl mx-auto px-6 py-28">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <h2 className="text-3xl font-light tracking-tight">{t("home.pricing.headingPre")}<span className="font-semibold text-white">{t("home.pricing.headingStrong")}</span></h2>
                <p className="text-zinc-400 mt-3">{t("home.pricing.subtitle")}</p>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono uppercase tracking-widest flex-wrap">
                {/* No account chip here. The fixed header already carries one, and a second
                    dropdown anchored inside this row opened over the plan cards and ran off the
                    edge of the viewport. Which plan you are on is already shown by the ACTIVE
                    badge and the CURRENT PLAN button on the cards themselves. */}
                <span className={!annual ? "text-white" : "text-zinc-500"}>{t("home.pricing.monthly")}</span>
                <button onClick={() => setAnnual(!annual)} className={`w-12 h-6 rounded-full relative transition-colors ${annual ? "ws-gradient-bg" : "bg-zinc-700"}`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${annual ? "left-6" : "left-0.5"}`} />
                </button>
                <span className={annual ? "text-white" : "text-zinc-500"}>{t("home.pricing.annual")} <span className="text-emerald-400">{t("home.pricing.annualDiscount")}</span></span>
              </div>
            </div>
          </Reveal>
          <div className="mt-12 grid md:grid-cols-3 gap-4">
            {PLANS.map((p, i) => {
              const id = p.id;
              const name = PLAN_NAME[id];
              const isCurrent = acct?.plan === id;
              const hasPlan = !!acct?.plan && acct.plan !== "free";
              const label = isCurrent
                ? t("home.pricing.currentPlan")
                : hasPlan
                  ? (PLAN_ORDER.indexOf(id) > PLAN_ORDER.indexOf(acct!.plan) ? t("home.pricing.upgradeTo", { plan: name }) : t("home.pricing.switchTo", { plan: name }))
                  : t("home.pricing.choose", { plan: name });
              return (
                <Reveal key={p.id} delay={i * 80}>
                  <div className={`relative h-full rounded-2xl border p-7 ${p.hot ? "border-cyan-600 bg-cyan-950/20" : "border-zinc-800 bg-zinc-950"}`}>
                    {isCurrent
                      ? <span className="absolute -top-3 left-7 px-2 py-1 bg-emerald-500 text-black text-[10px] font-mono uppercase tracking-widest rounded">{t("home.pricing.active")}</span>
                      : p.hot && <span className="absolute -top-3 left-7 px-2 py-1 ws-gradient-bg text-black text-[10px] font-mono uppercase tracking-widest rounded">{t("home.pricing.mostPopular")}</span>}
                    <h3 className="text-sm font-semibold uppercase tracking-widest text-white">{name}</h3>
                    {/* The struck price is the real monthly rate you would otherwise pay — the
                        annual toggle is a genuine discount, so this is a true reference price and
                        not an invented "was". Nothing is struck through on the monthly view. */}
                    <p className="mt-4 flex items-baseline gap-2 text-4xl font-light text-white">
                      {annual && (
                        <s className="text-xl text-zinc-600 decoration-zinc-600">${p.m}</s>
                      )}
                      <span>${annual ? p.a : p.m}<span className="text-sm text-zinc-500">/mo</span></span>
                    </p>
                    {annual && (
                      <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-emerald-400">
                        {t("home.pricing.saveAnnual", {
                          amount: String((p.m - p.a) * 12),
                          percent: String(Math.round((1 - p.a / p.m) * 100)),
                        })}
                      </p>
                    )}
                    <p className="mt-1 text-xs font-mono text-cyan-400">{p.credits} {t("home.pricing.creditsPerMonth")}</p>
                    <ul className="mt-6 space-y-2 text-sm text-zinc-400">
                      {p.perkKeys.map((k) => <li key={k} className="flex gap-2"><span className="text-emerald-400">✓</span>{t(`home.pricing.perks.${k}`)}</li>)}
                    </ul>
                    <Button
                      variant={isCurrent ? "outline" : p.hot ? "gradient" : "outline"}
                      disabled={isCurrent}
                      onClick={() => buy({ kind: "plan", id, cycle: annual ? "annual" : "monthly" })}
                      className={`mt-8 w-full ${isCurrent ? "border-emerald-800 text-emerald-400 bg-emerald-950/20" : ""}`}
                    >
                      {label}
                    </Button>
                  </div>
                </Reveal>
              );
            })}
          </div>
          <Reveal delay={200}>
            <div className="mt-8 rounded-xl border border-fuchsia-900/60 bg-fuchsia-950/20 p-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-widest text-fuchsia-300">{t("home.pricing.topupHeading")}</h3>
                <p className="text-xs text-zinc-400 mt-1">{t("home.pricing.topupSubtitle")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {/* Larger packs advertise their saving against the starter pack's per-credit rate.
                    That is an arithmetic fact about the two prices on screen, not a reference price
                    we invented — nothing here claims these ever cost more than they do. */}
                {PACKS.map((pack) => {
                  const base = PACKS[0].price / PACKS[0].credits;
                  const rate = pack.price / pack.credits;
                  const saving = Math.round((1 - rate / base) * 100);
                  return (
                    <button
                      key={pack.id}
                      onClick={() => buy({ kind: "pack", id: pack.id })}
                      className="group rounded-lg border border-fuchsia-700/70 px-4 py-3 text-left transition-colors hover:bg-fuchsia-900/30"
                    >
                      <span className="block text-xs font-semibold uppercase tracking-widest text-fuchsia-300">
                        {pack.credits.toLocaleString()} · ${pack.price}
                      </span>
                      <span className="mt-0.5 block text-[10px] font-mono tabular-nums text-zinc-500">
                        {saving > 0
                          ? t("home.pricing.packSaving", { percent: String(saving) })
                          : t("home.pricing.packBase")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </Reveal>

          {/* Promo redemption — the landing point for the YouTube launch code. */}
          <Reveal delay={240}>
            <div className="mt-4 rounded-xl border border-cyan-900/50 bg-cyan-950/15 p-6 grid md:grid-cols-[1fr_auto] gap-5 items-center">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-widest text-cyan-300">{t("home.pricing.promoHeading")}</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  {t("home.pricing.promoSubtitle")}
                </p>
              </div>
              <div className="md:w-80"><RedeemCode compact onRedeemed={() => loadAcct()} /></div>
            </div>
          </Reveal>

          {auth.user && (
            <div className="mt-6 text-center">
              <button onClick={claim} disabled={claimBusy}
                className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 hover:text-zinc-300 disabled:opacity-50">
                {claimBusy ? "Checking your payments…" : t("home.pricing.claimPurchase")}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* FAQ + CTA */}
      <section className="max-w-4xl mx-auto px-6 py-28">
        <Reveal>
          <h2 className="text-3xl font-light tracking-tight text-center">{t("home.faq.heading")}</h2>
        </Reveal>
        {/* One bordered list with dividers rather than a stack of separate cards: eight floating
            boxes read as eight unrelated things, and the repeated borders competed with the
            answers. The whole row is the hit target, and the chevron states which way it goes. */}
        <div className="mt-10 divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/40">
          {td<Dictionary["home"]["faq"]["items"]>("home.faq.items").map((item) => (
            <details key={item.q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 px-5 py-4 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/[0.03] group-open:text-white">
                {item.q}
                <ChevronDown
                  size={15}
                  className="shrink-0 text-zinc-500 transition-transform duration-200 group-open:rotate-180 group-open:text-zinc-300"
                />
              </summary>
              {/* Indented to the question's text, and held to a readable measure. */}
              <p className="max-w-2xl px-5 pb-5 text-sm leading-relaxed text-zinc-400">{item.a}</p>
            </details>
          ))}
        </div>
        <Reveal delay={150}>
          <div className="mt-20 text-center">
            <h2 className="text-4xl font-light tracking-tight">{t("home.finalCta.headingPre")}<span className="font-semibold text-white">{t("home.finalCta.headingStrong")}</span></h2>
            <a href="/studio" className="inline-block mt-8 px-10 py-4 bg-white text-black font-semibold text-sm uppercase tracking-widest rounded hover:bg-zinc-200 transition-colors">{t("home.finalCta.cta")}</a>
          </div>
        </Reveal>
      </section>

      {/* EXPLORE MORE — discovery tag cloud */}
      <section className="border-t border-zinc-800/60 bg-zinc-900/20">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <Reveal>
            <h2 className="text-center text-xs font-mono uppercase tracking-[0.25em] text-zinc-500 mb-8">{t("home.exploreMore.heading")}</h2>
          </Reveal>
          <div className="flex flex-wrap justify-center gap-2">
            {td<readonly string[]>("home.exploreMore.tags").map((tag, i) => (
              <a key={tag} href={EXPLORE_TAG_HREFS[i] ?? "/tools"} className="rounded-full border border-zinc-800 px-3 py-1.5 text-[11px] text-zinc-500 transition-colors hover:border-zinc-600 hover:text-white">
                {tag}
              </a>
            ))}
          </div>

          {/* The stack, stated rather than linked. Veo, Gemini, Parallel and FFmpeg were in the
              list above as tags — but two of them pointed at pages another tag already covered,
              so the block advertised 25 destinations and delivered 18. They are worth naming;
              they are not places to go. */}
          <p className="mt-8 text-center text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-700">
            {t("home.pricing.builtOn")}{" "}
            <span className="text-zinc-500">Veo 3.1</span> ·{" "}
            <span className="text-zinc-500">Gemini on Vertex AI</span> ·{" "}
            <span className="text-zinc-500">Parallel Search</span> ·{" "}
            <span className="text-zinc-500">FFmpeg</span>
          </p>
        </div>
      </section>

      {/* FOOTER — multi-column links, matching how a real platform organizes itself */}
      <footer className="border-t border-zinc-800/60 bg-zinc-950">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
            <div>
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-4">{t("home.footer.columns.image")}</h3>
              <ul className="space-y-2 text-xs text-zinc-400">
                <li><a href="/tools?tool=t2i" className="hover:text-white">{t("tools.t2i")}</a></li>
                <li><a href="/tools?tool=cast" className="hover:text-white">{t("tools.cast")}</a></li>
                <li><a href="/tools?tool=upscale" className="hover:text-white">{t("tools.upscale")}</a></li>
                <li><a href="/tools?tool=i2p" className="hover:text-white">{t("tools.i2p")}</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-4">{t("home.footer.columns.video")}</h3>
              <ul className="space-y-2 text-xs text-zinc-400">
                <li><a href="/tools?tool=t2v" className="hover:text-white">{t("tools.t2v")}</a></li>
                <li><a href="/tools?tool=i2v" className="hover:text-white">{t("tools.i2v")}</a></li>
                <li><a href="/tools?tool=flow" className="hover:text-white">{t("tools.flow")}</a></li>
                <li><a href="/tools?tool=ytkit" className="hover:text-white">{t("tools.ytkit")}</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-4">{t("home.footer.columns.distribute")}</h3>
              <ul className="space-y-2 text-xs text-zinc-400">
                <li><a href="/tools?tool=social" className="hover:text-white">{t("tools.social")}</a></li>
                <li><a href="/studio" className="hover:text-white">{t("home.footer.links.campaign8")}</a></li>
                <li><a href="/tools?tool=tts" className="hover:text-white">{t("tools.tts")}</a></li>
                <li><a href="/studio" className="hover:text-white">{t("home.footer.links.textEditor")}</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-4">{t("home.footer.columns.company")}</h3>
              <ul className="space-y-2 text-xs text-zinc-400">
                <li><a href="/#pricing" className="hover:text-white">{t("home.footer.links.pricing")}</a></li>
                <li><a href="/studio" className="hover:text-white">{t("home.footer.links.studio")}</a></li>
                <li><a href="/#showcase" className="hover:text-white">{t("home.footer.links.showcase")}</a></li>
                <li><a href="/" className="hover:text-white">{t("home.footer.links.home")}</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-4">{t("home.footer.columns.follow")}</h3>
              <div className="flex flex-wrap gap-3">
                {(["youtube", "instagram", "tiktok", "x", "linkedin", "discord"] as const).map((p) => (
                  <a key={p} href="#" onClick={(e) => e.preventDefault()} aria-label={p}
                    className="w-8 h-8 rounded-full border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-white hover:border-zinc-600 transition-colors">
                    <PlatformIcon platform={p} size={14} />
                  </a>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-zinc-800/60 flex flex-wrap justify-between items-center gap-4 text-[10px] font-mono uppercase tracking-widest text-zinc-600">
            <span className="flex items-center gap-2">
              <WorldsmithMark size={14} mono className="text-zinc-600 shrink-0" />
              WORLD<span className="text-zinc-400">SMITH</span> · {t("home.footer.brand")}
            </span>
            <span>{t("home.footer.techStack")}</span>
          </div>
        </div>
      </footer>

      {claimResult && (
        <ClaimResultModal
          result={claimResult}
          credits={acct?.credits}
          verifyState={verifySent}
          onResend={resendVerification}
          onClose={() => { setClaimResult(null); setVerifySent("idle"); }}
        />
      )}
    </main>
  );
}

const SUPPORT_EMAIL = "support@getworldsmith.com";

/**
 * Result of a manual purchase claim. The three outcomes need genuinely different responses —
 * a grant, an account that has to verify its email before it can be matched to a payment, and
 * "we looked and found nothing" — so each gets its own copy and its own next step rather than a
 * shared alert. The raw diagnostic stays available for support, but folded away by default.
 */
function ClaimResultModal({ result, credits, verifyState, onResend, onClose }: {
  result: ClaimResult;
  credits?: number;
  verifyState: "idle" | "sending" | "sent" | "error";
  onResend: () => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [showDetail, setShowDetail] = useState(false);
  const ok = !!result.granted;
  const unverified = result.reason === "unverified-email";

  const tone = ok
    ? { ring: "border-emerald-800 bg-emerald-950/40 text-emerald-400", icon: <CheckCircle2 size={22} /> }
    : unverified
      ? { ring: "border-amber-800 bg-amber-950/40 text-amber-400", icon: <MailWarning size={22} /> }
      : { ring: "border-zinc-700 bg-zinc-800/60 text-zinc-400", icon: <SearchX size={22} /> };

  return (
    <Modal onClose={onClose} maxWidth="max-w-md">
      <ModalHeader title={ok ? t("home.claim.appliedTitle") : unverified ? t("home.claim.verifyTitle") : t("home.claim.notFoundTitle")} onClose={onClose} />

      <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${tone.ring}`}>{tone.icon}</div>

      {ok ? (
        <div className="space-y-2">
          <p className="text-sm text-zinc-200">
            {t("home.claim.appliedBody", { granted: result.granted ?? "" })}
          </p>
          {credits !== undefined && (
            <p className="text-xs text-zinc-500 font-mono">{t("home.claim.newBalance", { credits: credits.toLocaleString() })}</p>
          )}
        </div>
      ) : unverified ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-300">
            {t("home.claim.verifyBody", { email: result.email })}
          </p>
          <button
            onClick={onResend}
            disabled={verifyState === "sending" || verifyState === "sent"}
            className="w-full py-2.5 rounded-lg bg-amber-500 text-black font-semibold text-xs uppercase tracking-widest hover:bg-amber-400 transition-colors disabled:opacity-60"
          >
            {verifyState === "sending" ? t("home.claim.sending") : verifyState === "sent" ? t("home.claim.sent") : t("home.claim.sendVerification")}
          </button>
          {verifyState === "error" && (
            <p className="text-xs text-red-400">{t("home.claim.sendError")}</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-zinc-300">
            {t("home.claim.notFoundBody", { email: result.email || "—" })}
          </p>
          <p className="text-xs text-zinc-500">
            {t("home.claim.notFoundHelp")}
          </p>
        </div>
      )}

      <div className="pt-2 border-t border-zinc-800 space-y-3">
        {!ok && (
          <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Missing credits after payment")}`}
            className="block text-[10px] font-mono uppercase tracking-widest text-cyan-400 hover:text-cyan-300">
            {t("home.claim.emailSupport")}
          </a>
        )}
        {result.detail && (
          <div>
            <button onClick={() => setShowDetail((v) => !v)}
              className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 hover:text-zinc-400">
              {showDetail ? t("home.claim.hideDetails") : t("home.claim.showDetails")}
            </button>
            {showDetail && (
              <p className="mt-2 text-[10px] font-mono text-zinc-500 break-all bg-zinc-950 border border-zinc-800 rounded p-2">
                {result.detail}
              </p>
            )}
          </div>
        )}
        <button onClick={onClose}
          className="w-full py-2 rounded-lg border border-zinc-700 text-zinc-300 text-xs uppercase tracking-widest hover:bg-zinc-800 transition-colors">
          {t("home.claim.close")}
        </button>
      </div>
    </Modal>
  );
}
