'use client';

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { serverClaimPurchase } from "@/app/actions/billing";

export default function BillingSuccess() {
  const auth = useAuth();
  const { t } = useLanguage();
  const [msg, setMsg] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!auth.user || ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const t = await auth.user!.getIdToken();
        const r = await serverClaimPurchase(t, {
          paymentId: params.get("payment_id") ?? undefined,
          subscriptionId: params.get("subscription_id") ?? undefined,
        });
        setMsg(
          r.granted
            ? `Purchase applied: ${r.granted}. Your balance and plan are updated.`
            : `Payment seen, but auto-apply couldn't match it. Debug: ${r.detail ?? "none"}. Use "Already paid? Claim purchase" on the pricing page, or paste this debug string to your developer.`
        );
      } catch (e: any) {
        setMsg(e?.message ?? "Could not apply the purchase automatically.");
      }
    })();
  }, [auth.user]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 space-y-6 text-center">
        <p className="text-3xl">🎉</p>
        <h1 className="text-xl font-semibold text-white">{t("billingSuccess.title")}</h1>
        <p className="text-sm text-zinc-400">
          {auth.user ? (msg ?? t("billingSuccess.applying")) : t("billingSuccess.signInToAttach")}
        </p>
        {!auth.user && (
          <button onClick={() => auth.openAuth()}
            className="w-full py-3 bg-white text-black text-xs font-semibold uppercase tracking-widest rounded hover:bg-zinc-200">
            {t("billingSuccess.signInToClaim")}
          </button>
        )}
        <div className="flex gap-3 justify-center pt-2">
          <a href="/studio" className="px-5 py-3 ws-gradient-bg text-black text-xs font-semibold uppercase tracking-widest rounded hover:brightness-110 transition-all">{t("billingSuccess.openStudio")}</a>
          <a href="/tools" className="px-5 py-3 border border-zinc-700 text-xs uppercase tracking-widest rounded hover:border-zinc-500">{t("billingSuccess.toolbox")}</a>
          <a href="/" className="px-5 py-3 border border-zinc-700 text-xs uppercase tracking-widest rounded hover:border-zinc-500">{t("billingSuccess.home")}</a>
        </div>
      </div>
    </main>
  );
}