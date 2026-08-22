'use client';

import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { AccountMenu } from "./AccountMenu";
import { LanguageMenu } from "./LanguageMenu";

/** Shared credits + account chip — was hand-duplicated across Landing/Studio/Tools.
 * Signed in: avatar → dropdown (credits, plan, profile, language, sign out).
 * Signed out: language switcher + separate Login / Sign up buttons. */
export function AuthChip({ credits, plan }: { credits?: number | null; plan?: string }) {
  const auth = useAuth();
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-2 shrink-0">
      {auth.user ? (
        <AccountMenu credits={credits} plan={plan} />
      ) : (
        <>
          <LanguageMenu />
          <button
            onClick={() => auth.openAuth("in")}
            className="px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors text-xs font-mono uppercase tracking-widest"
          >
            {t("account.login")}
          </button>
          <button
            onClick={() => auth.openAuth("up")}
            className="px-3 py-1.5 ws-gradient-bg text-black font-semibold rounded text-xs font-mono uppercase tracking-widest hover:brightness-110 transition-all"
          >
            {t("account.signUp")}
          </button>
        </>
      )}
    </div>
  );
}
