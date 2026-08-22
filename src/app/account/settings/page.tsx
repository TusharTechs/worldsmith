'use client';

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { serverGetCredits, serverGetProfile, serverUpdateProfile, serverUploadProfilePhoto, serverClaimPurchase, serverIsOwner } from "@/app/actions/billing";
import { serverListToolRuns } from "@/app/actions/tools";
import { PLANS, FREE_TRIAL_CREDITS } from "@/core/credits";
import { User, Crown, BarChart3, Camera, Gift } from "lucide-react";
import { RedeemCode } from "@/components/ui/RedeemCode";
import { Avatar } from "@/components/ui/Avatar";

const PLAN_CAP: Record<string, number> = {
  free: FREE_TRIAL_CREDITS,
  creator: PLANS.creator.credits,
  studio: PLANS.studio.credits,
  agency: PLANS.agency.credits,
};
const PLAN_NAME: Record<string, string> = {
  creator: PLANS.creator.name, studio: PLANS.studio.name, agency: PLANS.agency.name,
};

type Section = "profile" | "subscription" | "usage";

export default function AccountSettingsPage() {
  const auth = useAuth();
  const { t } = useLanguage();
  const [section, setSection] = useState<Section>("profile");
  const [credits, setCredits] = useState<number | null>(null);
  const [plan, setPlan] = useState<string | undefined>(undefined);
  const [sub, setSub] = useState<{ cycle: string; renewsAt: number | null; active: boolean } | null>(null);
  const [runs, setRuns] = useState<any[]>([]);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);

  // Until the profile has arrived, the fields hold "" — which is indistinguishable from a user
  // who has cleared them. Saving in that window wrote those empties over a real username,
  // headline and bio, so the form stays disabled until there is something true in it.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait for auth to settle before concluding anything about the user.
    if (auth.loading) return;
    if (!auth.user) { setLoading(false); return; }
    let cancelled = false;
    setName(auth.user.displayName ?? "");
    setPhotoPreview(auth.user.photoURL ?? null);
    (async () => {
      setLoading(true);
      const tok = await auth.user!.getIdToken();
      // Four independent reads, previously awaited one after another.
      const [acct, prof, runsRes, owner] = await Promise.allSettled([
        serverGetCredits(tok), serverGetProfile(tok), serverListToolRuns(tok), serverIsOwner(tok),
      ]);
      if (cancelled) return;
      if (acct.status === "fulfilled") {
        setCredits(acct.value.credits);
        setPlan(acct.value.plan);
        setSub({ cycle: acct.value.planCycle, renewsAt: acct.value.renewsAt, active: acct.value.subActive });
      }
      if (prof.status === "fulfilled") {
        setUsername(prof.value.username ?? "");
        setHeadline(prof.value.headline ?? "");
        setBio(prof.value.bio ?? "");
      }
      if (runsRes.status === "fulfilled") setRuns(runsRes.value);
      if (owner.status === "fulfilled") setIsOwner(owner.value);
      // Only allow editing once the profile read has actually resolved — a failed read must not
      // unlock a form whose fields would then overwrite the server's values with blanks.
      setLoading(prof.status !== "fulfilled");
    })();
    return () => { cancelled = true; };
  }, [auth.user?.uid, auth.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Downscale to a small square JPEG before it ever leaves the browser — an original photo's
  // data URL can be several MB, which is too large for a Server Action argument (Next.js's
  // Flight serialization rejects very large string payloads with a cryptic "array nesting" error).
  // A 320px avatar is plenty and keeps the payload a few tens of KB.
  const resizeToDataUrl = (file: File, maxDim = 320): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Could not read image"));
        img.onload = () => {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) { reject(new Error("Canvas unavailable")); return; }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });

  const onPickPhoto = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const dataUrl = await resizeToDataUrl(file);
    setPhotoPreview(dataUrl);
    setPhotoDataUrl(dataUrl);
  };

  const save = async () => {
    if (!auth.user || loading) return; // never write the empty initial state over a real profile
    setSaving(true); setSaved(false); setSaveError(null);
    try {
      const tok = await auth.user.getIdToken();
      let photoURL: string | undefined;
      if (photoDataUrl) photoURL = await serverUploadProfilePhoto(tok, photoDataUrl);
      if (name !== (auth.user.displayName ?? "") || photoURL) {
        await auth.updateDisplayProfile({ displayName: name, ...(photoURL ? { photoURL } : {}) });
      }
      await serverUpdateProfile(tok, { username, headline, bio });
      setPhotoDataUrl(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setSaveError(e?.message ?? "Couldn't save changes — try again.");
    } finally {
      setSaving(false);
    }
  };

  const claim = async () => {
    if (!auth.user) return;
    setClaimMsg(null);
    const tok = await auth.user.getIdToken();
    const r = await serverClaimPurchase(tok);
    setClaimMsg(r.granted ? `Purchase applied: ${r.granted}` : `No pending purchase found.`);
    const acct = await serverGetCredits(tok);
    setCredits(acct.credits);
    setPlan(acct.plan);
  };

  const planKey = (plan ?? "free").toLowerCase();
  const planLabel = `${PLAN_NAME[planKey] ?? t("account.free")} ${t("account.planSuffix")}`;
  const cap = PLAN_CAP[planKey] ?? FREE_TRIAL_CREDITS;
  const pct = credits != null ? Math.min(100, Math.max(4, Math.round((credits / cap) * 100))) : 0;
  const fileRef = useRef<HTMLInputElement>(null);

  if (auth.loading) {
    return (
      <main className="min-h-screen bg-zinc-950 font-sans text-zinc-100">
        <SiteHeader credits={credits} plan={plan} renewsAt={sub?.renewsAt} />
        <div className="mx-auto max-w-5xl px-6 pb-24 pt-28" aria-busy="true">
          <span className="inline-block h-4 w-40 animate-pulse rounded bg-zinc-800" />
        </div>
      </main>
    );
  }

  if (!auth.user) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
        <SiteHeader credits={credits} plan={plan} renewsAt={sub?.renewsAt} />
        <div className="max-w-lg mx-auto px-6 pt-32 text-center space-y-4">
          <h1 className="text-2xl font-light text-white">{t("account.notSignedIn")}</h1>
          <button onClick={() => auth.openAuth("in")} className="px-6 py-3 ws-gradient-bg text-black font-semibold text-xs uppercase tracking-widest rounded">
            {t("account.signIn")}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      <SiteHeader credits={credits} plan={plan} renewsAt={sub?.renewsAt} />
      <div className="max-w-4xl mx-auto px-6 pt-28 pb-24">
        <a href="/account" className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 hover:text-white">← Back to profile</a>
        <h1 className="mt-4 text-2xl font-light text-white">Manage account</h1>

        <div className="mt-8 grid md:grid-cols-[180px_1fr] gap-10">
          <div className="flex md:flex-col gap-1">
            {([
              ["profile", "Personal profile", User],
              ["subscription", "Subscription", Crown],
              ["usage", "Usage", BarChart3],
            ] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setSection(id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs transition-colors ${
                  section === id ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                }`}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
            {isOwner && (
              <a href="/account/promo"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors">
                <Gift size={14} /> Promo codes
              </a>
            )}
          </div>

          <div className="min-w-0">
            {section === "profile" && (
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="relative w-20 h-20 shrink-0">
                    {/* Shared Avatar rather than a bare <img>: a photo that fails to load —
                        an expired Google URL, or one stored on a host that no longer has the
                        file — otherwise renders as a broken glyph on the settings page. */}
                    <Avatar photoURL={photoPreview} label={name || auth.user.email || "A"} size={80} />
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 hover:text-white"
                    >
                      <Camera size={12} />
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPickPhoto(e.target.files)} />
                  </div>
                  <p className="text-xs text-zinc-500">{auth.user.email}</p>
                </div>

                <Field label="Name">
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name"
                    disabled={loading}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm focus:border-cyan-700 focus:outline-none disabled:animate-pulse disabled:border-zinc-800/60 disabled:bg-zinc-900/60 disabled:text-transparent disabled:placeholder-transparent" />
                </Field>

                <Field label="Username">
                  <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    placeholder="username"
                    disabled={loading}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm focus:border-cyan-700 focus:outline-none disabled:animate-pulse disabled:border-zinc-800/60 disabled:bg-zinc-900/60 disabled:text-transparent disabled:placeholder-transparent" />
                </Field>

                <Field label="Headline">
                  <input value={headline} onChange={(e) => setHeadline(e.target.value.slice(0, 60))} placeholder="Examples: Film Director, Film Creator"
                    disabled={loading}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm focus:border-cyan-700 focus:outline-none disabled:animate-pulse disabled:border-zinc-800/60 disabled:bg-zinc-900/60 disabled:text-transparent disabled:placeholder-transparent" />
                </Field>

                <Field label="Bio">
                  <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 300))} rows={4} placeholder="Type bio text here"
                    disabled={loading}
                    className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm focus:border-cyan-700 focus:outline-none disabled:animate-pulse disabled:border-zinc-800/60 disabled:bg-zinc-900/60 disabled:text-transparent disabled:placeholder-transparent" />
                  <p className="text-right text-[10px] text-zinc-600 mt-1">{bio.length} / 300</p>
                </Field>

                <div className="flex items-center gap-3">
                  <button
                    onClick={save}
                    disabled={saving || loading}
                    className="px-6 py-3 ws-gradient-bg text-black font-semibold text-xs uppercase tracking-widest rounded hover:brightness-110 transition-all disabled:opacity-50"
                  >
                    {loading ? "Loading…" : saving ? "Saving…" : "Save changes"}
                  </button>
                  {saved && <span className="text-xs text-emerald-400">Saved</span>}
                  {saveError && <span className="text-xs text-red-400">{saveError}</span>}
                </div>
              </div>
            )}

            {section === "subscription" && (
              <div className="space-y-5">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <span className="text-sm text-white">{planLabel}</span>
                      {/* A paid plan should say when it renews. The free plan has no term, and a
                          cancelled one keeps access to the end of the period it was paid for. */}
                      {planKey !== "free" && sub?.renewsAt && (
                        <p className="mt-0.5 text-[11px] text-zinc-500">
                          {t(sub.active ? "account.renewsOn" : "account.endsOn", {
                            date: new Date(sub.renewsAt).toLocaleDateString(undefined, {
                              year: "numeric", month: "long", day: "numeric",
                            }),
                          })}
                          {sub.active && <> · {t("account.billedCycle", { cycle: sub.cycle })}</>}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-zinc-400">{credits == null ? <span className="inline-block h-3 w-12 rounded bg-zinc-800 animate-pulse" aria-label="Loading credits" /> : <>{credits} {t("account.creditsLeft")}</>}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div className="h-full ws-gradient-bg rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <a href="/#pricing" className="inline-block px-5 py-2.5 ws-gradient-bg text-black text-xs font-semibold uppercase tracking-widest rounded hover:brightness-110 transition-all">
                    {planKey === "free" ? t("account.goPremium") : "Change plan"}
                  </a>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                  <RedeemCode onRedeemed={async () => {
                    if (!auth.user) return;
                    const acct = await serverGetCredits(await auth.user.getIdToken());
                    setCredits(acct.credits); setPlan(acct.plan);
                    setSub({ cycle: acct.planCycle, renewsAt: acct.renewsAt, active: acct.subActive });
                  }} />
                </div>
                <div>
                  <button onClick={claim} className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 hover:text-zinc-300">
                    {t("home.pricing.claimPurchase")}
                  </button>
                  {claimMsg && <p className="mt-2 text-xs text-zinc-400">{claimMsg}</p>}
                </div>
              </div>
            )}

            {section === "usage" && (
              <div className="space-y-2">
                {runs.length === 0 ? (
                  <p className="text-sm text-zinc-500">No usage yet — generate something from the Toolbox to see it here.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-widest text-zinc-500 border-b border-zinc-800">
                          <th className="py-2 pr-4">Date</th>
                          <th className="py-2 pr-4">Tool</th>
                          <th className="py-2 pr-4">Kind</th>
                          <th className="py-2 text-right">Credits</th>
                        </tr>
                      </thead>
                      <tbody className="text-zinc-400">
                        {runs.slice(0, 40).map((r) => (
                          <tr key={r.id} className="border-b border-zinc-800/60">
                            <td className="py-2 pr-4 font-mono text-zinc-500">{new Date(r.at).toLocaleDateString()}</td>
                            <td className="py-2 pr-4 uppercase">{r.tool}</td>
                            <td className="py-2 pr-4">{r.kind}</td>
                            <td className="py-2 text-right text-cyan-400">−{r.credits}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-zinc-400">{label}</span>
      {children}
    </label>
  );
}
