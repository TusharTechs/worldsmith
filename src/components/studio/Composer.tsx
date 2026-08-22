'use client';

import { useState } from "react";
import { Sparkles, Loader2, TriangleAlert, Shuffle } from "lucide-react";
import { useTypewriterPlaceholder } from "@/lib/use-typewriter";
import { useLanguage } from "@/components/LanguageProvider";

const STYLE_PRESETS = [
  "Cinematic Animation",
  "Live Action",
  "Anime",
  "Documentary",
  "Stop Motion",
  "Neo Noir",
  "Claymation",
  "Retro VHS",
];

const DURATIONS = [15, 30, 60, 90];

/**
 * Prompts, not placeholders in the filler sense — each is a complete, runnable brief with a
 * subject and a turn, so the typewriter is demonstrating the shape of a good input rather than
 * decorating an empty box. Kept short enough to read in one pass at 38ms/char.
 */
const IDEAS = [
  "A tiny wind-up robot searching a scrapyard for the owner who left it behind.",
  "The last lighthouse keeper on a coast the sea is quietly taking back.",
  "A midnight food cart that only appears to people having their worst day.",
  "Two rival origami cranes competing for the same sunlit windowsill.",
  "A cartographer who discovers her maps redraw themselves overnight.",
  "The night shift at a repair shop for broken constellations.",
];

/**
 * The director's brief.
 *
 * The old version was three unlabelled boxes — a bare textarea, a text input that truncated to
 * "Cinematic Animatio", and a naked number. Everything here is named, every choice is offered
 * before it has to be typed, and the price of the run is on the button rather than in footnote
 * text below it.
 */
export function Composer({
  prompt, setPrompt,
  style, setStyle,
  duration, setDuration,
  onRun, isRunning,
  estimate, credits, signedIn, creditBlock,
}: {
  prompt: string; setPrompt: (v: string) => void;
  style: string; setStyle: (v: string) => void;
  duration: number; setDuration: (v: number) => void;
  onRun: () => void; isRunning: boolean;
  estimate: number; credits: number | null; signedIn: boolean;
  creditBlock: string | null;
}) {
  const { t } = useLanguage();
  const [customDuration, setCustomDuration] = useState(!DURATIONS.includes(duration));
  const short = credits !== null && credits < estimate;
  const typed = useTypewriterPlaceholder(IDEAS, prompt.length === 0);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="ws-idea" className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
            {t("studio.composer.yourIdea")}
          </label>
          <button
            type="button"
            onClick={() => setPrompt(IDEAS[Math.floor(Math.random() * IDEAS.length)])}
            className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-zinc-600 transition-colors hover:text-cyan-400"
          >
            <Shuffle size={10} /> {t("studio.composer.surpriseMe")}
          </button>
        </div>
        <textarea
          id="ws-idea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder={typed || t("studio.composer.placeholder")}
          className="w-full resize-none rounded-xl border border-white/[0.09] bg-white/[0.03] p-3.5 text-[13px] leading-relaxed text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-cyan-500/50 focus:bg-white/[0.05] focus:outline-none focus:ring-1 focus:ring-cyan-500/20"
        />
        {!prompt.trim() && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {IDEAS.slice(0, 3).map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => setPrompt(idea)}
                title={idea}
                className="max-w-full truncate rounded-full border border-white/[0.07] px-2.5 py-1 text-[10.5px] text-zinc-500 transition-colors hover:border-cyan-500/40 hover:text-cyan-300"
              >
                {idea.split(" ").slice(0, 4).join(" ")}…
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("studio.composer.look")}</span>
        <div className="flex flex-wrap gap-1.5">
          {STYLE_PRESETS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStyle(s)}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                style === s
                  ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-300"
                  : "border-white/[0.09] text-zinc-400 hover:border-white/20 hover:text-zinc-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <input
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          placeholder={t("studio.composer.lookCustom")}
          className="w-full rounded-lg border border-white/[0.09] bg-white/[0.03] px-3 py-2 text-[12px] text-zinc-200 placeholder:text-zinc-600 transition-colors focus:border-cyan-500/50 focus:outline-none"
        />
      </div>

      <div className="space-y-2">
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("studio.composer.runtime")}</span>
        <div className="flex gap-1.5">
          {DURATIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => { setDuration(d); setCustomDuration(false); }}
              className={`flex-1 rounded-lg border py-1.5 text-[11px] font-mono tabular-nums transition-colors ${
                !customDuration && duration === d
                  ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-300"
                  : "border-white/[0.09] text-zinc-400 hover:border-white/20 hover:text-zinc-200"
              }`}
            >
              {d}s
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustomDuration(true)}
            className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-mono transition-colors ${
              customDuration
                ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-300"
                : "border-white/[0.09] text-zinc-400 hover:border-white/20 hover:text-zinc-200"
            }`}
          >
            ···
          </button>
        </div>
        {customDuration && (
          <input
            type="number"
            min={5}
            max={600}
            value={duration}
            onChange={(e) => setDuration(Math.max(5, Math.min(600, parseInt(e.target.value) || 5)))}
            className="w-full rounded-lg border border-white/[0.09] bg-white/[0.03] px-3 py-2 text-[12px] font-mono tabular-nums text-zinc-200 focus:border-cyan-500/50 focus:outline-none"
          />
        )}
      </div>

      <button
        onClick={onRun}
        disabled={isRunning || !prompt.trim()}
        className="group relative w-full overflow-hidden rounded-xl bg-white py-3 text-black transition-all hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em]">
          {isRunning ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {isRunning ? t("studio.composer.building") : t("studio.composer.build")}
        </span>
      </button>

      {signedIn && (
        <div className="flex items-baseline justify-between gap-2 text-[10px] font-mono tabular-nums">
          <span className="text-zinc-500">
            <span className={short ? "text-amber-400" : "text-cyan-400"}>{t("studio.composer.credits", { n: estimate.toLocaleString() })}</span>
          </span>
          {credits !== null && (
            <span className={short ? "text-amber-400" : "text-zinc-600"}>
              {t("studio.composer.balance", { n: credits.toLocaleString() })}
            </span>
          )}
        </div>
      )}

      {creditBlock && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-900/60 bg-amber-950/30 p-3 text-[11px] leading-relaxed text-amber-300">
          <TriangleAlert size={13} className="mt-px shrink-0" />
          <span>{creditBlock}</span>
        </div>
      )}

      {signedIn && short && !creditBlock && (
        <a href="/#pricing" className="block text-[10px] font-mono uppercase tracking-widest text-cyan-400 transition-colors hover:text-cyan-300">
          {t("studio.composer.topUp")}
        </a>
      )}
    </div>
  );
}
