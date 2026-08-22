'use client';

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { serverClaimPurchase, serverGetCredits } from "@/app/actions/billing";

type Phase =
  | { kind: "working" }
  | { kind: "done"; granted: string; balance: number | null }
  | { kind: "attention"; detail?: string };

/**
 * Post-checkout landing.
 *
 * The page has one job — tell someone who has just paid whether the money reached their account —
 * and the states are not interchangeable. Applying, applied, and could-not-match used to render as
 * the same grey sentence, with a raw debug string shown to the buyer in the failure case.
 *
 * The buttons stay inert while the claim is in flight. Someone who has just been charged should
 * not be invited to walk away mid-transaction; navigation is not blocked (hijacking it would be
 * hostile, and the grant is idempotent server-side anyway) but nothing here encourages it either.
 */
export default function BillingSuccess() {
  const auth = useAuth();
  const { t } = useLanguage();
  const [phase, setPhase] = useState<Phase>({ kind: "working" });
  const ran = useRef(false);

  useEffect(() => {
    if (!auth.user || ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const token = await auth.user!.getIdToken();
        const r = await serverClaimPurchase(token, {
          paymentId: params.get("payment_id") ?? undefined,
          subscriptionId: params.get("subscription_id") ?? undefined,
        });
        if (!r.granted) {
          setPhase({ kind: "attention", detail: r.detail ?? undefined });
          return;
        }
        // Read the balance back rather than trusting the grant string, so the number shown is the
        // account's actual state after the purchase settled.
        let balance: number | null = null;
        try {
          balance = (await serverGetCredits(await auth.user!.getIdToken())).credits;
        } catch { /* the grant succeeded; a failed balance read shouldn't look like a failed payment */ }
        setPhase({ kind: "done", granted: r.granted, balance });
      } catch (e) {
        setPhase({ kind: "attention", detail: (e as Error)?.message });
      }
    })();
  }, [auth.user]);

  const working = auth.user != null && phase.kind === "working";

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="rounded-2xl border border-white/[0.07] bg-zinc-900/60 backdrop-blur-sm overflow-hidden">
          {/* A thin lit edge marks the outcome before any text is read. */}
          <div
            className={`h-0.5 w-full ${
              phase.kind === "done" ? "ws-gradient-bg"
              : phase.kind === "attention" ? "bg-amber-500/70"
              : "bg-zinc-700 animate-pulse"
            }`}
          />

          <div className="p-8 space-y-7">
            <div className="flex flex-col items-center text-center gap-4">
              <StatusMedallion phase={phase} signedIn={auth.user != null} />
              <div className="space-y-1.5">
                <h1 className="text-xl font-semibold text-white">
                  {phase.kind === "attention" ? t("billingSuccess.attentionTitle") : t("billingSuccess.title")}
                </h1>
                <p className="text-sm text-zinc-400 max-w-sm">
                  {!auth.user ? t("billingSuccess.signInToAttach")
                    : phase.kind === "working" ? t("billingSuccess.applyingNote")
                    : phase.kind === "attention" ? t("billingSuccess.attentionBody")
                    : null}
                </p>
              </div>
            </div>

            {/* What actually landed on the account. Only shown once it is true. */}
            {phase.kind === "done" && (
              <dl className="rounded-xl border border-white/[0.07] bg-white/[0.02] divide-y divide-white/[0.06]">
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <dt className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                    {t("billingSuccess.applied")}
                  </dt>
                  <dd className="text-sm text-zinc-200 text-right">{phase.granted}</dd>
                </div>
                {phase.balance != null && (
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <dt className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                      {t("billingSuccess.balanceNow")}
                    </dt>
                    <dd className="text-sm font-semibold text-white tabular-nums">
                      {phase.balance.toLocaleString()}{" "}
                      <span className="text-zinc-500 font-normal">{t("billingSuccess.credits")}</span>
                    </dd>
                  </div>
                )}
              </dl>
            )}

            {phase.kind === "attention" && phase.detail && (
              <details className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
                <summary className="cursor-pointer text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                  {t("billingSuccess.technicalDetails")}
                </summary>
                <p className="mt-2 break-words font-mono text-[11px] leading-relaxed text-zinc-400">{phase.detail}</p>
              </details>
            )}

            {!auth.user ? (
              <button
                onClick={() => auth.openAuth()}
                className="w-full py-3 ws-gradient-bg text-black text-xs font-semibold uppercase tracking-widest rounded-lg hover:brightness-110 transition-all"
              >
                {t("billingSuccess.signInToClaim")}
              </button>
            ) : (
              <div className="space-y-3">
                <a
                  href="/studio"
                  aria-disabled={working}
                  tabIndex={working ? -1 : undefined}
                  onClick={(e) => { if (working) e.preventDefault(); }}
                  className={`flex items-center justify-center gap-2 w-full py-3 rounded-lg text-xs font-semibold uppercase tracking-widest transition-all ${
                    working
                      ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                      : "ws-gradient-bg text-black hover:brightness-110"
                  }`}
                >
                  {t("billingSuccess.openStudio")} {!working && <ArrowRight size={13} />}
                </a>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { href: "/account/settings", label: t("billingSuccess.subscription") },
                    { href: "/", label: t("billingSuccess.home") },
                  ].map((l) => (
                    <a
                      key={l.href}
                      href={l.href}
                      aria-disabled={working}
                      tabIndex={working ? -1 : undefined}
                      onClick={(e) => { if (working) e.preventDefault(); }}
                      className={`py-2.5 text-center rounded-lg border text-[11px] uppercase tracking-widest transition-colors ${
                        working
                          ? "border-zinc-800 text-zinc-600 cursor-not-allowed"
                          : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
                      }`}
                    >
                      {l.label}
                    </a>
                  ))}
                </div>
                {working && (
                  <p className="text-center text-[11px] text-zinc-500">{t("billingSuccess.stayHere")}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/** Circular status mark — replaces an emoji, and reads as three distinct outcomes at a glance. */
function StatusMedallion({ phase, signedIn }: { phase: Phase; signedIn: boolean }) {
  const base = "flex h-14 w-14 items-center justify-center rounded-full border";
  if (!signedIn || phase.kind === "working") {
    return (
      <div className={`${base} border-zinc-700 bg-zinc-800/60 text-zinc-400`}>
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }
  if (phase.kind === "attention") {
    return (
      <div className={`${base} border-amber-500/40 bg-amber-500/10 text-amber-400`}>
        <AlertTriangle size={22} />
      </div>
    );
  }
  return (
    <div className={`${base} border-transparent ws-gradient-bg text-black`}>
      <Check size={24} strokeWidth={3} />
    </div>
  );
}
