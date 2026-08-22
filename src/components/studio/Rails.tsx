'use client';

import { Check, Loader2, Film, Trash2 } from "lucide-react";
import type { Project } from "@/core/project-schemas";
import { useLanguage } from "@/components/LanguageProvider";

/* ─────────────────────────── Production timeline ─────────────────────────── */

export interface Stage { key: string; label: string; done: boolean; active: boolean }

/**
 * Run progress. The previous version was a flat checklist; a production is a sequence, so the
 * rail shows position in it — everything behind you filled, the current step lit and moving,
 * everything ahead dimmed but named, so the wait has a shape.
 */
export function StageRail({ stages }: { stages: Stage[] }) {
  const { t } = useLanguage();
  const doneCount = stages.filter((s) => s.done).length;
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("studio.timeline")}</h3>
        <span className="text-[10px] font-mono tabular-nums text-zinc-600">{doneCount}/{stages.length}</span>
      </div>
      <ol className="relative">
        {stages.map((s, i) => {
          const isLast = i === stages.length - 1;
          return (
            <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
              {!isLast && (
                <span
                  aria-hidden
                  className={`absolute left-[8px] top-[18px] bottom-0 w-px ${s.done ? "bg-emerald-500/50" : "bg-white/[0.08]"}`}
                />
              )}
              <span
                className={`relative z-10 mt-[1px] flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border transition-colors ${
                  s.done
                    ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-400"
                    : s.active
                      ? "border-cyan-400/70 bg-cyan-500/15 text-cyan-300"
                      : "border-white/[0.12] bg-transparent text-zinc-700"
                }`}
              >
                {s.done ? <Check size={9} strokeWidth={3} /> : s.active ? <Loader2 size={9} className="animate-spin" /> : null}
                {s.active && <span className="absolute inset-0 animate-ping rounded-full border border-cyan-400/40" />}
              </span>
              <span
                className={`text-[11.5px] leading-[17px] transition-colors ${
                  s.done ? "text-zinc-400" : s.active ? "text-cyan-300" : "text-zinc-600"
                }`}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ───────────────────────────── Project list ───────────────────────────── */

/** How far through the full pipeline a project actually got, 0–1. */
function progressOf(p: Project): number {
  const marks = [
    !!p.research, !!p.opportunity, !!p.worldBible, !!p.storyboard, !!p.productionPlan,
    p.generationStatus === "COMPLETED", p.videoGenerationStatus === "COMPLETED",
    !!p.finalFilmAssetId, !!p.distributionPackage,
  ];
  return marks.filter(Boolean).length / marks.length;
}

function statusOf(p: Project, t: (k: string) => string): { label: string; tone: string } {
  if (p.status === "FAILED_WITH_PARTIAL_ARTIFACTS") return { label: t("studio.status.partial"), tone: "text-red-400" };
  if (p.distributionPackage) return { label: t("studio.status.shipped"), tone: "text-cyan-400" };
  if (p.finalFilmAssetId) return { label: t("studio.status.filmReady"), tone: "text-emerald-400" };
  if (p.generationStatus === "GENERATING" || p.videoGenerationStatus === "GENERATING")
    return { label: t("studio.status.rendering"), tone: "text-amber-400" };
  if (p.status === "COMPLETED") return { label: t("studio.status.planned"), tone: "text-zinc-400" };
  return { label: t("studio.status.running"), tone: "text-amber-400" };
}

export function ProjectCard({
  project, active, onOpen, onDelete,
}: {
  project: Project; active: boolean; onOpen: () => void; onDelete: (e: React.MouseEvent) => void;
}) {
  const { t } = useLanguage();
  const pct = progressOf(project);
  const st = statusOf(project, t);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className={`group relative w-full cursor-pointer overflow-hidden rounded-xl border p-3 text-left transition-colors ${
        active
          ? "border-cyan-500/40 bg-cyan-500/[0.06]"
          : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`min-w-0 flex-1 truncate text-[13px] font-medium ${active ? "text-white" : "text-zinc-200"}`}>
          {project.title}
        </p>
        <button
          onClick={onDelete}
          aria-label={`Delete ${project.title}`}
          className="-m-1 shrink-0 rounded p-1 text-zinc-700 opacity-0 transition-all hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
        >
          <Trash2 size={11} />
        </button>
      </div>

      <div className="mt-1.5 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
        <span className={st.tone}>{st.label}</span>
        <span className="text-zinc-700">·</span>
        <span className="tabular-nums text-zinc-600">{project.requestedDuration}s</span>
        {project.finalFilmAssetId && <Film size={10} className="ml-auto text-emerald-500/70" />}
      </div>

      <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${pct === 1 ? "bg-emerald-500/70" : "ws-gradient-bg"}`}
          style={{ width: `${Math.max(4, pct * 100)}%` }}
        />
      </div>
    </div>
  );
}
