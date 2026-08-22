'use client';

import { WorldsmithMark } from "@/components/ui/Logo";
import { AuthChip } from "@/components/ui/AuthChip";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { EngineStatus, type EngineModes } from "./EngineStatus";
import { useLanguage } from "@/components/LanguageProvider";

/**
 * Studio chrome.
 *
 * Studio and Toolbox are the two halves of the product, so moving between them is a primary
 * navigation act — it gets a segmented control, not the bordered "Toolbox →" chip that used to
 * sit welded to the wordmark and read as a developer shortcut.
 */
export function StudioTopBar({
  modes,
  credits,
  plan,
  project,
}: {
  modes: EngineModes;
  credits?: number | null;
  plan?: string;
  project?: { title: string; status?: string } | null;
}) {
  const { t } = useLanguage();
  return (
    <header className="relative z-40 h-14 shrink-0 border-b border-white/[0.07] bg-zinc-950/80 backdrop-blur-xl">
      <div className="flex h-full items-center gap-3 px-4 sm:px-5">
        <a href="/" className="group flex shrink-0 items-center gap-2.5" title="Worldsmith home">
          <WorldsmithMark size={24} className="shrink-0 transition-transform duration-700 group-hover:rotate-[135deg]" title="Worldsmith" />
          <span className="hidden text-[15px] font-light tracking-[0.2em] text-zinc-300 sm:inline">
            WORLD<span className="ws-gradient-text font-semibold">SMITH</span>
          </span>
        </a>

        {/* No Toolbox tab here by design. A segmented control implies the two are peers, and
            offers an exit at exactly the moment the visitor should be committing to a production.
            The Toolbox stays reachable from the homepage nav and from ⌘K — discoverable without
            being advertised against the flagship. */}
        <span className="ml-1 hidden shrink-0 rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-zinc-400 sm:inline">
          {t("studio.nav")}
        </span>

        {project && (
          <div className="hidden min-w-0 items-center gap-2 border-l border-white/[0.07] pl-3 md:flex">
            <span className="truncate text-sm text-zinc-300">{project.title}</span>
            {project.status && (
              <span className="shrink-0 text-[10px] font-mono uppercase tracking-widest text-zinc-600">{project.status}</span>
            )}
          </div>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="hidden lg:block"><EngineStatus modes={modes} /></div>
          <CommandPalette />
          <AuthChip credits={credits} plan={plan} />
        </div>
      </div>
    </header>
  );
}
