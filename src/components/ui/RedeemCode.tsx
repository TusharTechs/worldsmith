'use client';

import { useLanguage } from "@/components/LanguageProvider";
import { useState } from "react";
import { Gift, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { serverRedeemPromo } from "@/app/actions/billing";

/**
 * Promo / coupon redemption. Used on the pricing section and in account settings.
 * The server action is the real gate (transactional, one redemption per user per code) —
 * everything here is just presentation.
 */
export function RedeemCode({
  onRedeemed,
  compact = false,
}: {
  onRedeemed?: (credits: number, balance: number) => void;
  compact?: boolean;
}) {
  const auth = useAuth();
  const { t } = useLanguage();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async () => {
    if (!code.trim()) return;
    if (!auth.user) { auth.openAuth("up"); return; }
    setBusy(true); setMsg(null);
    try {
      const tok = await auth.user.getIdToken();
      const r = await serverRedeemPromo(tok, code);
      if (r.ok) {
        setMsg({ ok: true, text: `+${r.credits} credits added. You now have ${r.balance}.` });
        setCode("");
        onRedeemed?.(r.credits, r.balance);
      } else {
        setMsg({ ok: false, text: r.error });
      }
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? t("home.redeem.error") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {!compact && (
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-zinc-400">
          <Gift size={13} className="text-cyan-400" /> Have a code?
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="FORGE20"
          spellCheck={false}
          aria-label={t("home.redeem.label")}
          className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm font-mono tracking-widest uppercase placeholder:text-zinc-600 placeholder:tracking-widest focus:outline-none focus:border-cyan-700"
        />
        <button
          onClick={submit}
          disabled={busy || !code.trim()}
          className="shrink-0 px-4 py-2.5 ws-gradient-bg text-black font-semibold text-xs uppercase tracking-widest rounded-lg hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : null}
          {busy ? t("home.redeem.busy") : t("home.redeem.cta")}
        </button>
      </div>
      {msg && (
        <p className={`text-xs flex items-start gap-1.5 ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>
          {msg.ok && <Check size={13} className="shrink-0 mt-0.5" />}
          <span>{msg.text}</span>
        </p>
      )}
    </div>
  );
}
