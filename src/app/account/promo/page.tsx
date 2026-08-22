'use client';

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { SiteHeader } from "@/components/SiteHeader";
import {
  serverIsOwner, serverListPromoCodes, serverUpsertPromoCode, serverGetCredits,
} from "@/app/actions/billing";
import type { PromoCode } from "@/store/credits-store";
import { Gift, Plus, Loader2, ShieldAlert } from "lucide-react";

/** Owner-only promo code management. Gated server-side by LEGACY_OWNER_EMAIL — this page
 *  only hides the UI; the actions themselves re-check on every call. */
export default function PromoAdminPage() {
  const auth = useAuth();
  const [owner, setOwner] = useState<boolean | null>(null);
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [credits, setCredits] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [amount, setAmount] = useState(20);
  const [maxRedemptions, setMaxRedemptions] = useState<string>("");
  const [note, setNote] = useState("");

  const load = async () => {
    // Firebase restores the session asynchronously, so auth.user is null on the first render even
    // for a signed-in owner. Treating that as "not the owner" showed the owner an access-denied
    // notice that corrected itself seconds later. Undecided must stay undecided.
    if (auth.loading) { setOwner(null); return; }
    if (!auth.user) { setOwner(false); return; }
    const tok = await auth.user.getIdToken();
    try { setCredits((await serverGetCredits(tok)).credits); } catch {}
    try {
      const isOwner = await serverIsOwner(tok);
      setOwner(isOwner);
      if (isOwner) setCodes(await serverListPromoCodes(tok));
    } catch { setOwner(false); }
  };

  useEffect(() => { load(); }, [auth.user?.uid, auth.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async (preset?: { code: string; credits: number; note: string }) => {
    if (!auth.user) return;
    const payload = preset ?? {
      code,
      credits: amount,
      note,
    };
    if (!payload.code.trim()) { setErr("Enter a code."); return; }
    setBusy(true); setErr(null);
    try {
      const tok = await auth.user.getIdToken();
      await serverUpsertPromoCode(tok, {
        code: payload.code,
        credits: payload.credits,
        note: payload.note || undefined,
        maxRedemptions: preset ? undefined : (maxRedemptions ? parseInt(maxRedemptions, 10) : undefined),
        active: true,
      });
      setCode(""); setNote(""); setMaxRedemptions("");
      setCodes(await serverListPromoCodes(tok));
    } catch (e: any) {
      setErr(e?.message ?? "Could not save that code.");
    } finally { setBusy(false); }
  };

  const launchExists = codes.some((c) => c.code === "FORGE20");

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      <SiteHeader credits={credits} />
      <div className="max-w-3xl mx-auto px-6 pt-28 pb-24">
        <a href="/account" className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 hover:text-white">← Back to profile</a>
        <h1 className="mt-4 text-2xl font-light text-white flex items-center gap-2.5">
          <Gift size={20} className="text-cyan-400" /> Promo codes
        </h1>

        {owner === null && <p className="mt-8 text-sm text-zinc-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Checking access…</p>}

        {owner === false && (
          <div className="mt-8 rounded-xl border border-amber-900/60 bg-amber-950/20 p-5 flex gap-3">
            <ShieldAlert size={18} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-amber-300">Owner access only</p>
              <p className="mt-1 text-xs text-zinc-400">
                This page is limited to the account set as <span className="font-mono">OWNER_EMAIL</span>.
                Sign in with that account to manage codes.
              </p>
            </div>
          </div>
        )}

        {owner === true && (
          <div className="mt-8 space-y-10">
            {!launchExists && (
              <div className="rounded-xl border border-cyan-900/60 bg-cyan-950/20 p-5">
                <p className="text-sm text-white">Set up your launch code</p>
                <p className="mt-1 text-xs text-zinc-400">
                  Creates <span className="font-mono text-cyan-300">FORGE20</span> — 20 credits, one redemption
                  per account, unlimited total claims. This is the code to say in your YouTube video.
                </p>
                <button
                  onClick={() => create({ code: "FORGE20", credits: 20, note: "YouTube launch — 20 free credits" })}
                  disabled={busy}
                  className="mt-4 px-5 py-2.5 ws-gradient-bg text-black text-xs font-semibold uppercase tracking-widest rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {busy ? "Creating…" : "Create FORGE20"}
                </button>
              </div>
            )}

            {/* existing codes */}
            <section className="space-y-3">
              <h2 className="text-xs uppercase tracking-widest text-zinc-500">Active codes</h2>
              {codes.length === 0 ? (
                <p className="text-sm text-zinc-500">No codes yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-widest text-zinc-500 border-b border-zinc-800">
                        <th className="py-2 pr-4">Code</th>
                        <th className="py-2 pr-4">Credits</th>
                        <th className="py-2 pr-4">Claimed</th>
                        <th className="py-2 pr-4">Limit</th>
                        <th className="py-2">Note</th>
                      </tr>
                    </thead>
                    <tbody className="text-zinc-400">
                      {codes.map((c) => (
                        <tr key={c.code} className="border-b border-zinc-800/60">
                          <td className="py-2.5 pr-4 font-mono text-cyan-300">{c.code}</td>
                          <td className="py-2.5 pr-4 tabular-nums">{c.credits}</td>
                          <td className="py-2.5 pr-4 tabular-nums">{c.redemptionCount ?? 0}</td>
                          <td className="py-2.5 pr-4">{c.maxRedemptions ? c.maxRedemptions : "unlimited"}</td>
                          <td className="py-2.5 text-zinc-500">{c.note ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* create another */}
            <section className="space-y-3 border-t border-zinc-800 pt-8">
              <h2 className="text-xs uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                <Plus size={13} /> Create a code
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="space-y-1.5">
                  <span className="text-xs text-zinc-400">Code</span>
                  <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CREATOR50"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm font-mono tracking-widest focus:outline-none focus:border-cyan-700" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs text-zinc-400">Credits</span>
                  <input type="number" min={1} value={amount} onChange={(e) => setAmount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm tabular-nums focus:outline-none focus:border-cyan-700" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs text-zinc-400">Max total claims <span className="text-zinc-600">(blank = unlimited)</span></span>
                  <input value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value.replace(/\D/g, ""))} placeholder=""
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm tabular-nums focus:outline-none focus:border-cyan-700" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs text-zinc-400">Note</span>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Where this code is being used"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm focus:outline-none focus:border-cyan-700" />
                </label>
              </div>
              {err && <p className="text-xs text-red-400">{err}</p>}
              <button onClick={() => create()} disabled={busy}
                className="px-5 py-2.5 border border-zinc-700 rounded-lg text-xs uppercase tracking-widest text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50">
                {busy ? "Saving…" : "Save code"}
              </button>
              <p className="text-[11px] text-zinc-600">
                Every code is one redemption per account, enforced in the same transaction that grants the
                credits — a user can't claim the same code twice.
              </p>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
