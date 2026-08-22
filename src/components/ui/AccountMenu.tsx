'use client';

import { useEffect, useRef, useState } from "react";
import { Crown, User, Settings, LogOut, Languages as LanguagesIcon, ChevronRight, Check, Gift } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { LANGUAGES } from "@/i18n/languages";
import { PLANS, FREE_TRIAL_CREDITS } from "@/core/credits";
import { serverGetProfile, serverIsOwner } from "@/app/actions/billing";
import { Avatar } from "./Avatar";

const PLAN_CAP: Record<string, number> = {
  free: FREE_TRIAL_CREDITS,
  creator: PLANS.creator.credits,
  studio: PLANS.studio.credits,
  agency: PLANS.agency.credits,
};

// Plan tier names (Creator/Studio/Agency) are treated as product/brand names and stay in
// English across every locale — only "Free" (not a paid tier) is actually translated.
const PLAN_NAME: Record<string, string> = {
  creator: PLANS.creator.name, studio: PLANS.studio.name, agency: PLANS.agency.name,
};

/** Cheapest → most expensive. Drives what (if anything) we invite the user to upgrade to. */
const PLAN_ORDER = ["free", "creator", "studio", "agency"] as const;

/** The next tier up, or null when the account is already on the top plan. */
function nextTier(planKey: string): string | null {
  const i = PLAN_ORDER.indexOf(planKey as (typeof PLAN_ORDER)[number]);
  if (i < 0) return PLANS.creator.name;              // unknown plan → treat as free
  const next = PLAN_ORDER[i + 1];
  return next ? PLAN_NAME[next] ?? null : null;      // undefined at the top of the list
}

/** Signed-in avatar → dropdown panel (credits, plan, profile, language, sign out) — Higgsfield-style. */
export function AccountMenu({ credits, plan }: { credits?: number | null; plan?: string }) {
  const auth = useAuth();
  const { locale, setLocale, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [username, setUsername] = useState<string | undefined>(undefined);
  const [owner, setOwner] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setLangOpen(false); }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); setLangOpen(false); } };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDocClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  useEffect(() => {
    if (!auth.user) { setUsername(undefined); setOwner(false); return; }
    (async () => {
      const tok = await auth.user!.getIdToken();
      try { setUsername((await serverGetProfile(tok)).username); } catch {}
      try { setOwner(await serverIsOwner(tok)); } catch {}
    })();
  }, [auth.user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!auth.user) return null;

  const label = auth.user.displayName ?? auth.user.email?.split("@")[0] ?? "Account";
  const planKey = (plan ?? "free").toLowerCase();
  const planLabel = `${PLAN_NAME[planKey] ?? t("account.free")} ${t("account.planSuffix")}`;
  const cap = PLAN_CAP[planKey] ?? FREE_TRIAL_CREDITS;
  const pct = credits != null ? Math.min(100, Math.max(4, Math.round((credits / cap) * 100))) : 0;
  const currentLang = LANGUAGES.find((l) => l.code === locale) ?? LANGUAGES[0];
  const upgradeTo = nextTier(planKey);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full ring-2 ring-transparent hover:ring-zinc-700 transition-all shrink-0"
        aria-label="Account menu"
      >
        <Avatar photoURL={auth.user.photoURL} label={label} size={36} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden z-50 fade-in">
          <div className="p-4 flex items-center gap-3 border-b border-zinc-800">
            <Avatar photoURL={auth.user.photoURL} label={label} size={40} />
            <div className="min-w-0">
              <p className="text-sm text-white truncate">{label}</p>
              <p className="text-xs text-zinc-500 truncate">{username ? `@${username} · ` : ""}{planLabel}</p>
            </div>
          </div>

          {/* Credits → the usage/subscription detail, not the price list. Buying is the Upgrade
              row directly below, so the two intents don't fight over one click. */}
          <a href="/account/settings" onClick={() => setOpen(false)} className="block p-4 border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">{t("account.credits")}</span>
              <span className="text-zinc-300 flex items-center gap-1">{credits ?? 0} {t("account.creditsLeft")} <ChevronRight size={12} /></span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full ws-gradient-bg rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </a>

          {/* Plan-aware: invite free users to go premium, paid users to the next tier up, and
              say nothing upgrade-ish to someone already on the top plan. */}
          {upgradeTo ? (
            <a href="/#pricing" onClick={() => setOpen(false)} className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors">
              <span className="flex items-center gap-2.5 text-xs text-zinc-200 min-w-0">
                <Crown size={14} className="text-amber-400 shrink-0" />
                <span className="truncate">{planKey === "free" ? t("account.goPremium") : `Upgrade to ${upgradeTo}`}</span>
              </span>
              <span className="shrink-0 px-3 py-1 ws-gradient-bg text-black text-[10px] font-semibold uppercase tracking-widest rounded-full">{t("account.upgrade")}</span>
            </a>
          ) : (
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400">
              <Crown size={14} className="text-amber-400 shrink-0" />
              <span>You're on the top plan.</span>
            </div>
          )}

          <div className="py-1.5">
            <a href="/account" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-xs text-zinc-300 hover:bg-zinc-800/50 transition-colors">
              <User size={14} className="text-zinc-500" /> {t("account.viewProfile")}
            </a>
            <a href="/account/settings" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-xs text-zinc-300 hover:bg-zinc-800/50 transition-colors">
              <Settings size={14} className="text-zinc-500" /> {t("account.manageAccount")}
            </a>
            {/* Owner-only. The server action re-checks on every call, so hiding this is
                presentation only, never the actual gate. */}
            {owner && (
              <a href="/account/promo" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-xs text-zinc-300 hover:bg-zinc-800/50 transition-colors">
                <Gift size={14} className="text-cyan-400" /> Promo codes
              </a>
            )}

            <button
              type="button"
              onClick={() => setLangOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-zinc-300 hover:bg-zinc-800/50 transition-colors"
            >
              <span className="flex items-center gap-2.5"><LanguagesIcon size={14} className="text-zinc-500" /> {t("account.language")}</span>
              <span className="flex items-center gap-1 text-zinc-500">
                {currentLang.label} <ChevronRight size={12} className={`transition-transform ${langOpen ? "rotate-90" : ""}`} />
              </span>
            </button>
            {langOpen && (
              <div className="bg-zinc-950/60 max-h-48 overflow-y-auto">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => { setLocale(l.code); setLangOpen(false); }}
                    className={`w-full flex items-center justify-between px-4 py-2 pl-10 text-xs transition-colors ${
                      l.code === locale ? "text-cyan-300" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {l.label}
                    {l.code === locale && <Check size={12} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => { auth.logout(); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-xs text-red-400 hover:bg-red-950/20 border-t border-zinc-800 transition-colors"
          >
            <LogOut size={14} /> {t("account.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
