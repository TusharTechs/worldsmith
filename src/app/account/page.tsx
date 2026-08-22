'use client';

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { serverGetCredits, serverGetProfile } from "@/app/actions/billing";
import { serverListProjects } from "@/app/actions/store";
import { serverListToolRuns } from "@/app/actions/tools";
import type { Project } from "@/core/project-schemas";
import { PLANS, FREE_TRIAL_CREDITS } from "@/core/credits";
import { Crown, LogOut, Settings, Clapperboard, ImageIcon } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { CreationTile } from "@/components/tools/CreationTile";

const PLAN_CAP: Record<string, number> = {
  free: FREE_TRIAL_CREDITS,
  creator: PLANS.creator.credits,
  studio: PLANS.studio.credits,
  agency: PLANS.agency.credits,
};

const PLAN_NAME: Record<string, string> = {
  creator: PLANS.creator.name, studio: PLANS.studio.name, agency: PLANS.agency.name,
};

const PLAN_ORDER = ["free", "creator", "studio", "agency"] as const;
/** The next tier up, or null when already on the top plan. */
function nextTier(planKey: string): string | null {
  const i = PLAN_ORDER.indexOf(planKey as (typeof PLAN_ORDER)[number]);
  if (i < 0) return PLANS.creator.name;
  const next = PLAN_ORDER[i + 1];
  return next ? PLAN_NAME[next] ?? null : null;
}

const STATUS_TONE: Record<Project["status"], string> = {
  CREATED: "border-zinc-700 text-zinc-400",
  RESEARCH_COMPLETE: "border-zinc-700 text-zinc-400",
  OPPORTUNITY_COMPLETE: "border-zinc-700 text-zinc-400",
  WORLD_COMPLETE: "border-cyan-800 text-cyan-400",
  STORYBOARD_COMPLETE: "border-cyan-800 text-cyan-400",
  PRODUCTION_PLAN_COMPLETE: "border-cyan-800 text-cyan-400",
  COMPLETED: "border-emerald-800 text-emerald-400",
  FAILED_WITH_PARTIAL_ARTIFACTS: "border-red-900 text-red-400",
};

export default function AccountPage() {
  const auth = useAuth();
  const { t } = useLanguage();
  const [credits, setCredits] = useState<number | null>(null);
  const [plan, setPlan] = useState<string | undefined>(undefined);
  const [projects, setProjects] = useState<Project[]>([]);
  const [creations, setCreations] = useState<any[]>([]);
  const [username, setUsername] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!auth.user) { setCredits(null); setPlan(undefined); setProjects([]); setCreations([]); setUsername(undefined); return; }
    (async () => {
      const t = await auth.user!.getIdToken();
      try {
        const acct = await serverGetCredits(t);
        setCredits(acct.credits);
        setPlan(acct.plan);
      } catch {}
      try { setUsername((await serverGetProfile(t)).username); } catch {}
      try { setProjects(await serverListProjects(t)); } catch {}
      try { setCreations(await serverListToolRuns(t)); } catch {}
    })();
  }, [auth.user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = auth.user?.displayName ?? auth.user?.email?.split("@")[0] ?? "Account";
  const handle = username || auth.user?.email?.split("@")[0] || "";
  const planKey = (plan ?? "free").toLowerCase();
  const planLabel = `${PLAN_NAME[planKey] ?? t("account.free")} ${t("account.planSuffix")}`;
  const cap = PLAN_CAP[planKey] ?? FREE_TRIAL_CREDITS;
  const pct = credits != null ? Math.min(100, Math.max(4, Math.round((credits / cap) * 100))) : 0;
  const upgradeTo = nextTier(planKey);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      <SiteHeader credits={credits} plan={plan} />
      <div className="max-w-5xl mx-auto px-6 pt-28 pb-24">
        {!auth.user ? (
          <div className="text-center space-y-4 py-24">
            <h1 className="text-2xl font-light text-white">{t("account.notSignedIn")}</h1>
            <p className="text-sm text-zinc-500">{t("account.notSignedInSubtitle")}</p>
            <button
              onClick={() => auth.openAuth("in")}
              className="px-6 py-3 ws-gradient-bg text-black font-semibold text-xs uppercase tracking-widest rounded hover:brightness-110 transition-all"
            >
              {t("account.signIn")}
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-[240px_1fr] gap-10">
            {/* SIDEBAR */}
            <div className="space-y-6">
              <Avatar photoURL={auth.user.photoURL} label={label} size={80} />
              <div>
                <h1 className="text-lg text-white truncate">{label}</h1>
                {handle && <p className="text-xs text-zinc-500 truncate">@{handle}</p>}
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">{planLabel}</span>
                  <span className="text-zinc-300">{credits ?? 0} {t("account.creditsLeft")}</span>
                </div>
                <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full ws-gradient-bg rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                {/* Don't invite an upgrade to someone already on the top plan. */}
                {upgradeTo ? (
                  <a href="/#pricing" className="flex items-center gap-1.5 text-[11px] text-amber-400 hover:text-amber-300 pt-1">
                    <Crown size={12} /> {planKey === "free" ? t("account.goPremium") : `Upgrade to ${upgradeTo}`}
                  </a>
                ) : (
                  <p className="flex items-center gap-1.5 text-[11px] text-zinc-500 pt-1">
                    <Crown size={12} className="text-amber-400" /> Top plan
                  </p>
                )}
              </div>

              <a
                href="/account/settings"
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg border border-zinc-800 text-xs text-zinc-300 hover:border-zinc-600 hover:text-white transition-colors"
              >
                <Settings size={14} /> {t("account.manageAccount")}
              </a>
              <button
                onClick={() => auth.logout()}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg border border-zinc-800 text-xs text-red-400 hover:bg-red-950/20 transition-colors"
              >
                <LogOut size={14} /> {t("account.signOut")}
              </button>
            </div>

            {/* MAIN */}
            <div className="space-y-14 min-w-0">
              <section>
                <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-4">Your projects</h2>
                {projects.length === 0 ? (
                  <EmptyState
                    title="Ready to start your first production?"
                    subtitle="One idea in — a complete production out."
                    cta="Open Studio"
                    href="/studio"
                    icon={<Clapperboard size={20} />}
                  />
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {projects
                      .slice()
                      .sort((a, b) => b.updatedAt - a.updatedAt)
                      .map((p) => (
                        <a
                          key={p.id}
                          href={`/studio?project=${p.id}`}
                          className="block rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 hover:border-zinc-600 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className={`text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border ${STATUS_TONE[p.status]}`}>
                              {p.status.replace(/_/g, " ")}
                            </span>
                          </div>
                          <h3 className="text-sm text-white truncate">{p.title || "Untitled production"}</h3>
                          <p className="mt-1 text-[10px] font-mono text-zinc-600">{new Date(p.updatedAt).toLocaleDateString()}</p>
                        </a>
                      ))}
                  </div>
                )}
              </section>

              <section>
                <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-4">Your creations</h2>
                {creations.length === 0 ? (
                  <EmptyState
                    title="No creations yet"
                    subtitle="Make your first image, video, or social post — it takes one prompt."
                    cta="Start creating"
                    href="/tools?tool=t2i"
                    icon={<ImageIcon size={20} />}
                  />
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {creations.map((r) => <CreationTile key={r.id} r={r} />)}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function EmptyState({ title, subtitle, cta, href, icon }: { title: string; subtitle: string; cta: string; href: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center">
      <div className="mx-auto w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mb-4">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1.5 text-xs text-zinc-500">{subtitle}</p>
      <a href={href} className="inline-block mt-5 px-5 py-2.5 ws-gradient-bg text-black text-xs font-semibold uppercase tracking-widest rounded hover:brightness-110 transition-all">
        {cta}
      </a>
    </div>
  );
}
