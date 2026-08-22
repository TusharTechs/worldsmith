'use client';

import { useEffect, useRef, useState } from "react";
import { Search, Compass, Globe2, Clapperboard, Film, Share2, Play, type LucideIcon } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

/** A finished Worldsmith production — the whole claim of the page, playing. */
const SHOWREEL = "/showcase/vid-1787380605932-wc0u9d.mp4";

const STILLS = [
  "/showcase/img-1787380256135-vwb27a.webp",
  "/showcase/img-1787380381409-xxs0c4.webp",
  "/showcase/img-1787380473621-tlzvsu.webp",
  "/showcase/img-1787380324434-ut24u9.webp",
];

/** Icons and provider credits stay in code; the words come from the dictionary. */
const BEAT_META: { icon: LucideIcon; by: string }[] = [
  { icon: Search, by: "Parallel" },
  { icon: Compass, by: "Gemini" },
  { icon: Globe2, by: "Gemini" },
  { icon: Clapperboard, by: "Gemini" },
  { icon: Film, by: "Veo + VLM" },
  { icon: Share2, by: "Gemini" },
];

export function EmptyCanvas() {
  const { t, td } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);

  /**
   * Start the reel once it actually has frames. Calling play() from mount raced the load and the
   * rejected promise was swallowed, leaving a loaded-but-paused video parked on frame 0 — which,
   * because the film fades up from black, rendered as an empty box.
   */
  const start = () => {
    const v = videoRef.current;
    if (!v) return;
    setReady(true);
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setBlocked(true); return; }
    // Skip the fade-from-black so a paused first frame still shows the film.
    if (v.currentTime < 0.4 && v.duration > 1) v.currentTime = 0.8;
    v.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
  };

  useEffect(() => {
    const v = videoRef.current;
    if (v && v.readyState >= 2) start(); // already buffered from cache — onLoadedData won't fire
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
      <div className="mb-8 text-center">
        <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-cyan-400/80">{t("studio.empty.kicker")}</p>
        <h1 className="mt-3 text-balance text-3xl font-light tracking-tight text-white sm:text-4xl">
          {t("studio.empty.titlePre")}
          <span className="ws-gradient-text font-semibold">{t("studio.empty.titleStrong")}</span>.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-pretty text-sm leading-relaxed text-zinc-400">
          {t("studio.empty.subtitle")}
        </p>
      </div>

      <figure className="group relative overflow-hidden rounded-2xl border border-white/[0.09] bg-black">
        <video
          ref={videoRef}
          src={SHOWREEL}
          muted
          loop
          playsInline
          preload="metadata"
          onLoadedData={start}
          className={`aspect-video w-full object-cover transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"}`}
        />
        {!ready && <div className="absolute inset-0 ws-skeleton" />}
        {blocked && (
          <button
            onClick={() => videoRef.current?.play().then(() => setBlocked(false)).catch(() => {})}
            aria-label={t("studio.empty.play")}
            className="absolute inset-0 flex items-center justify-center transition-colors hover:bg-black/20"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/25 bg-black/50 backdrop-blur-sm">
              <Play size={18} className="ml-0.5 text-white" fill="currentColor" />
            </span>
          </button>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
        <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-2 p-4 sm:p-5">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-cyan-400">{t("studio.empty.madeBy")}</p>
            <p className="mt-0.5 text-lg font-medium text-white">Scrap &amp; Spark</p>
          </div>
          <p className="text-[10px] font-mono uppercase tracking-widest tabular-nums text-zinc-400">
            {t("studio.empty.stats")}
          </p>
        </figcaption>
      </figure>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {STILLS.map((s) => (
          <div key={s} className="relative overflow-hidden rounded-lg border border-white/[0.07] bg-zinc-900">
            {/* Frames from the same run — the point is that they are on-model with each other. */}
            <img src={s} alt="" loading="lazy" className="aspect-video w-full object-cover opacity-70 transition-opacity hover:opacity-100" />
          </div>
        ))}
      </div>

      <div className="mt-10">
        <p className="mb-4 text-center text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-600">
          {t("studio.empty.whatHappens")}
        </p>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {td<{ title: string; desc: string }[]>("studio.empty.beats").map((b, i) => (
            <li
              key={b.title}
              className="group flex gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 transition-colors hover:border-white/[0.14] hover:bg-white/[0.04]"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 transition-colors group-hover:bg-cyan-500/15">
                {(() => { const I = BEAT_META[i].icon; return <I size={14} />; })()}
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[9px] font-mono tabular-nums text-zinc-600">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="text-[13px] font-medium text-zinc-100">{b.title}</h3>
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{b.desc}</p>
                <p className="mt-1 text-[9px] font-mono uppercase tracking-widest text-zinc-700">{BEAT_META[i].by}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
