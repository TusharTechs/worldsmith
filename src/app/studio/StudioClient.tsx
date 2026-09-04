'use client';

import { useState, useEffect, useRef } from 'react';
import { PipelineState, PipelineStage } from '@/core/orchestrator';
import { createProjectStore } from '@/store/factory';
import { startProduction } from '@/app/actions/production';
import { serverGetModes } from '@/app/actions/store';
import {
  serverBuildGenerationPlan,
  serverApproveAndGenerate,
  serverRetryAsset,
  serverGetImageMode,
  serverGenerateVideos,
  serverGetVideoMode,
  serverGetVLMMode,
  serverQCProject,
  serverApproveAsset,
  serverAssembleFilm,
  serverGenerateDistribution,
  serverGetDistributionMode,
  serverGenerateCreatives,
  serverGenerateVoiceover,
  serverMixAudio,
  serverGetAudioMode,
  serverRestoreScrapAndSpark,
  serverSaveTextCreative,
  serverClaimUnownedProjects,
  serverResetStuckGeneration,
} from '@/app/actions/generation';
import { serverGetCredits, serverClaimPurchase } from "@/app/actions/billing";
import { estimateProductionCredits, estimateCredits, VEO_CLIP_SECONDS } from '@/core/credits';
import { ProjectStore } from '@/store/project-store';
import { Project } from '@/core/project-schemas';
import { Asset } from '@/core/asset-schemas';
import { GenerationPlan, GenerationStatus } from '@/core/generation-schemas';
import { DistributionPackage } from '@/core/distribution-schemas';
import CreativeTextEditor from '@/components/CreativeTextEditor';
import { TextLayer } from '@/core/textkit';
import { useAuth } from '@/components/AuthProvider';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Download, BookOpen, Layers, Clapperboard, Megaphone, Activity, Search } from 'lucide-react';
import { downloadFromUri, assetFilename } from '@/lib/download';
import { StudioTopBar } from '@/components/studio/StudioTopBar';
import { Composer } from '@/components/studio/Composer';
import { EmptyCanvas } from '@/components/studio/EmptyCanvas';
import { StageRail, ProjectCard } from '@/components/studio/Rails';
import { WorkspaceTabs, type WorkTab } from '@/components/studio/WorkspaceTabs';

/**
 * The planner returns one prose blob with loose markdown in it. Rendering that raw put literal
 * "**" on screen; splitting on its own numbering turns it back into the ordered list it is.
 */
function routingSteps(raw: string): string[] {
  const cleaned = raw.replace(/\*\*/g, "").trim();
  const parts = cleaned
    .split(/(?:^|\s)\d+\.\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [cleaned];
}

/**
 * Shown when the per-project spend ceiling is below what the next step costs. A disabled button
 * plus a red sentence made the user hunt for the number to change; this names the shortfall and
 * offers the exact raise, rounded up to the next dollar.
 */
function BudgetBlock({ need, budget, onRaise }: { need: number; budget: number; onRaise: (v: number) => void }) {
  const suggested = Math.ceil(need + 1);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-900/60 bg-amber-950/25 p-3">
      <p className="text-[11px] leading-relaxed text-amber-300">
        This step needs <span className="font-mono tabular-nums">${need.toFixed(2)}</span> but the project
        budget is <span className="font-mono tabular-nums">${budget.toFixed(2)}</span>.
      </p>
      <button
        onClick={() => onRaise(suggested)}
        className="shrink-0 rounded-md bg-amber-500 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-black transition-colors hover:bg-amber-400"
      >
        Raise to ${suggested}
      </button>
    </div>
  );
}

const STAGE_LABELS: Record<string, string> = {
  RESEARCH: 'Analyzing global signals...',
  OPPORTUNITY: 'Detecting content opportunities...',
  CREATIVE_DIRECTION: 'Developing creative strategy...',
  WORLD_BUILDING: 'Architecting the World Bible...',
  STORYBOARDING: 'Designing cinematic storyboard...',
  PRODUCTION_PLANNING: 'Calculating production logistics...',
  COMPLETE: 'Production Ready.'
};

const STATUS_TO_ACTIVE_STAGE: Record<string, PipelineStage> = {
  CREATED: 'RESEARCH',
  RESEARCH_COMPLETE: 'OPPORTUNITY',
  OPPORTUNITY_COMPLETE: 'CREATIVE_DIRECTION',
  WORLD_COMPLETE: 'STORYBOARDING',
  STORYBOARD_COMPLETE: 'PRODUCTION_PLANNING',
  PRODUCTION_PLAN_COMPLETE: 'COMPLETE',
  COMPLETED: 'COMPLETE',
  FAILED_WITH_PARTIAL_ARTIFACTS: 'ERROR',
};

type UIState = PipelineState & {
  generationStatus?: GenerationStatus;
  generationStartedAt?: number;
  videoGenerationStatus?: GenerationStatus;
  videoGenerationStartedAt?: number;
  finalFilmAssetId?: string;
  distributionStatus?: "PENDING" | "GENERATING" | "COMPLETED" | "FAILED";
  voiceoverAssetId?: string;
};

const STUCK_THRESHOLD_MS = 5 * 60 * 1000;

function mapProjectToState(p: Project): UIState {
  return {
    stage: STATUS_TO_ACTIVE_STAGE[p.status] ?? 'COMPLETE',
    projectId: p.id,
    error: p.error,
    research: p.research,
    researchEvidence: p.researchEvidence,
    researchSearchIds: p.researchSearchIds,
    opportunity: p.opportunity,
    worldBible: p.worldBible,
    storyboard: p.storyboard,
    productionPlan: p.productionPlan,
    logs: p.logs || [],
    generationStatus: p.generationStatus,
    generationStartedAt: p.generationStartedAt,
    videoGenerationStatus: p.videoGenerationStatus,
    videoGenerationStartedAt: p.videoGenerationStartedAt,
    finalFilmAssetId: p.finalFilmAssetId,
    distributionStatus: p.distributionStatus,
    voiceoverAssetId: p.voiceoverAssetId,
  };
}

export default function StudioDashboard() {
  const auth = useAuth();

  const [llmMode, setLlmMode] = useState("gemini");
  const [researchMode, setResearchMode] = useState<"PARALLEL" | "MOCK">("MOCK");
  const [imageMode, setImageMode] = useState<string>("MOCK");
  const [videoMode, setVideoMode] = useState<string>("MOCK");
  const [vlmMode, setVlmMode] = useState<string>("MOCK");
  const [distMode, setDistMode] = useState<string>("MOCK");
  const [audioMode, setAudioMode] = useState<string>("MOCK");

  const [store, setStore] = useState<ProjectStore | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [persistenceMode, setPersistenceMode] = useState<'LOCAL' | 'FIRESTORE' | null>(null);
  const [projectQuery, setProjectQuery] = useState("");

  // Starts empty on purpose. The old default shipped every visitor the same robot short — and
  // said "60-second" in prose while the runtime control said something else. The composer's
  // typewriter now demonstrates what a good brief looks like without pre-committing to one.
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('Cinematic Animation, moody lighting, highly detailed');
  const [duration, setDuration] = useState(15);
  // Hard ceiling on real provider spend for one project. Defaulted below the cost of a typical
  // run before, which left the primary action disabled out of the box with only a red footnote
  // to explain why. It now clears a normal short, and the blocked state offers to raise itself.
  const [budgetUSD, setBudgetUSD] = useState(25);

  const [state, setState] = useState<UIState | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [generationPlan, setGenerationPlan] = useState<GenerationPlan | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingVideos, setIsGeneratingVideos] = useState(false);
  const [isAssembling, setIsAssembling] = useState(false);
  const [distributionPackage, setDistributionPackage] = useState<DistributionPackage | null>(null);
  const [isDistributing, setIsDistributing] = useState(false);
  const [activeDistTab, setActiveDistTab] = useState<string>("youtube");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isCreatives, setIsCreatives] = useState(false);
  const [isVoiceover, setIsVoiceover] = useState(false);
  const [isMixing, setIsMixing] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [plan, setPlan] = useState<string | undefined>(undefined);
  const [creditBlock, setCreditBlock] = useState<string | null>(null);

  const [textKit, setTextKit] = useState<null | {
    platform: "youtube" | "instagram" | "pinterest";
    imageUri: string;
    w: number;
    h: number;
    layers?: TextLayer[];
  }>(null);

  // One shared estimator with the server gate, so the number quoted here is the number enforced.
  const studioEstimate = estimateProductionCredits(duration);

  /**
   * Canvas tabs. A production's output is long enough that one scroll buries the thing you came
   * back for, so it splits along the phases the pipeline already has. Tabs stay visible before
   * their phase exists — a greyed "Distribute" is a promise, a hidden one is a surprise.
   */
  const [activeTab, setActiveTab] = useState<string>("story");

  /**
   * Tabs are URL-addressable: `/studio?tab=distribute` opens on that panel.
   *
   * Without this, six different homepage tags all landed on the same top-of-page view, so
   * "Continuity QC" and "8-Platform Distribution" were indistinguishable destinations. It also
   * makes a specific panel shareable, which a workspace this deep should support.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t) setActiveTab(t);
  }, []);

  const selectTab = (id: string) => {
    setActiveTab(id);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", id);
      window.history.replaceState(null, "", url);   // replace, so tabbing doesn't fill history
    }
  };

  /**
   * Follow the run forward as each phase first becomes reachable.
   *
   * Keyed on how far the *run* has got, not on which tab is showing. Comparing against the shown
   * tab meant any deliberate choice — a click, or a ?tab= deep link — looked like drift and got
   * reset on the next render, so `/studio?tab=distribute` snapped straight back to Story.
   */
  const furthestSeen = useRef<string>("");
  useEffect(() => {
    const furthest =
      state?.finalFilmAssetId ? (distributionPackage ? "distribute" : "film")
      : (assets.length > 0 || state?.productionPlan) ? "assets"
      : "story";
    if (furthest !== furthestSeen.current) {
      const first = furthestSeen.current === "";
      furthestSeen.current = furthest;
      // On the very first pass just record where the run is; only a genuine advance moves the view.
      if (!first) setActiveTab(furthest);
    }
  }, [state?.finalFilmAssetId, distributionPackage, state?.productionPlan, assets.length]);

  const workTabs: WorkTab[] = [
    { id: "story", label: "Story", icon: BookOpen, enabled: !!state?.research || !!state?.worldBible },
    { id: "assets", label: "Assets", icon: Layers, badge: assets.filter((a) => a.status === "COMPLETED").length, enabled: !!state?.productionPlan || assets.length > 0 },
    { id: "film", label: "Film", icon: Clapperboard, enabled: !!state?.finalFilmAssetId },
    { id: "distribute", label: "Distribute", icon: Megaphone, enabled: !!state?.finalFilmAssetId },
    { id: "telemetry", label: "Telemetry", icon: Activity, badge: state?.logs?.length ?? 0, enabled: !!state?.logs?.length },
  ];


  useEffect(() => {
    const s = createProjectStore();
    setStore(s);
    setPersistenceMode(s.mode);
    // fine to leave the getter defaulted (returns no projects) until the auth effect below fires
    s.listProjects().then(setProjects);
    serverGetModes().then((m) => {
      setLlmMode(m.llm);
      setResearchMode(m.research);
    });
    serverGetImageMode().then(setImageMode);
    serverGetVideoMode().then(setVideoMode);
    serverGetVLMMode().then(setVlmMode);
    serverGetDistributionMode().then(setDistMode);
    serverGetAudioMode().then(setAudioMode);
  }, []);

  // Consolidated auth effect: claim legacy projects, attach any pending purchase, then read balance
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!auth.user) return;
      // Give the local store a live token getter so it can call the (now auth-scoped) server
      // actions for project list/get/delete. No-op for the direct-Firestore store.
      store?.setIdTokenGetter?.(() => (auth.user ? auth.user.getIdToken() : Promise.resolve(null)));
      try {
        const t = await auth.user.getIdToken();
        await serverClaimUnownedProjects(t).catch(() => {});
        await serverClaimPurchase(t).catch(() => {});
      } catch {}
      if (cancelled) return;
      if (store) setProjects(await store.listProjects());
      await loadCredits();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.uid, store]);

  const loadCredits = async () => {
    if (!auth.user) { setCredits(null); setPlan(undefined); return; }
    try {
      const t = await auth.user.getIdToken();
      const r = await serverGetCredits(t);
      setCredits(r.credits);
      setPlan(r.plan);
    } catch (e) {
      console.error("[UI] loadCredits failed:", e);
      setCredits(null);
    }
  };

  // Deep-link: /studio?project=<id> (e.g. from the account page's "Your projects" list) —
  // opens straight into that production once the store + auth-scoped project list are ready.
  const deepLinkedRef = useRef(false);
  useEffect(() => {
    if (deepLinkedRef.current || !store) return;
    const pid = new URLSearchParams(window.location.search).get("project");
    if (!pid) { deepLinkedRef.current = true; return; }
    deepLinkedRef.current = true;
    loadProject(pid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, auth.user?.uid]);

  const refreshProjects = async () => {
    if (store) setProjects(await store.listProjects());
  };

  const refreshAssets = async (projectId: string) => {
    if (!store) return;
    setAssets(await store.listAssets(projectId));
  };

  const runPipeline = async () => {
    if (!store) return;
    if (!auth.user) { auth.openAuth(); return; }
    // Gate on the per-request estimate rather than a flat threshold
    if (credits !== null && credits < studioEstimate) {
      setCreditBlock(`This production needs ≈ ${studioEstimate} credits (you have ${credits}). Top up in Pricing.`);
      setTimeout(() => setCreditBlock(null), 6000);
      return;
    }
    setIsRunning(true);
    setState({ stage: 'RESEARCH', logs: [] });
    setGenerationPlan(null);
    setAssets([]);
    setDistributionPackage(null);
    try {
      const idToken = await auth.user.getIdToken();
      // ownerUid is now set at creation time (server-verified) — no separate claim step needed.
      const { projectId } = await startProduction({ idToken, prompt, style, duration });
      for (;;) {
        await new Promise((r) => setTimeout(r, 1500));
        const p = await store.getProject(projectId);
        if (!p) continue;
        setState(mapProjectToState(p));
        if (p.status === 'COMPLETED' || p.status === 'FAILED_WITH_PARTIAL_ARTIFACTS') {
          if (p.status === 'COMPLETED' && !p.generationPlan) {
            try {
              const plan = await serverBuildGenerationPlan(idToken, projectId, budgetUSD);
              setGenerationPlan(plan);
            } catch (e) {
              console.error("[UI] Failed to auto-build generation plan:", e);
            }
          }
          break;
        }
      }
    } catch (e: any) {
      setState({ stage: 'ERROR', logs: [], error: e?.message ?? 'Production failed to start.' });
    }
    setIsRunning(false);
    loadCredits();
    refreshProjects();
  };

  const loadProject = async (id: string) => {
    if (!store) return;
    const p = await store.getProject(id);
    if (!p) return;
    setState(mapProjectToState(p));
    setGenerationPlan(p.generationPlan ?? null);
    setDistributionPackage(p.distributionPackage ?? null);
    refreshAssets(id);
  };

  const deleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!store) return;
    if (!auth.user) { auth.openAuth(); return; }
    if (!window.confirm("Delete this production? This cannot be undone.")) return;
    await store.deleteProject(id);
    refreshProjects();
    if (state?.projectId === id) {
      setState(null);
      setGenerationPlan(null);
      setAssets([]);
      setDistributionPackage(null);
    }
  };

  const restoreArchive = async () => {
    if (!auth.user) { auth.openAuth(); return; }
    await serverRestoreScrapAndSpark();
    refreshProjects();
  };

  const approveAndGenerate = async () => {
    if (!auth.user) { auth.openAuth(); return; }
    if (!state?.projectId || !store) return;
    const imageCost = (generationPlan?.totalAssets ?? 0) * 5;
    if (credits !== null && credits < imageCost) {
      setCreditBlock(`Need ${imageCost} credits to generate ${generationPlan?.totalAssets} assets (you have ${credits}).`);
      setTimeout(() => setCreditBlock(null), 6000);
      return;
    }
    setIsGenerating(true);
    try {
      const idToken = await auth.user.getIdToken();
      await serverApproveAndGenerate(idToken, state.projectId, budgetUSD);
      for (;;) {
        await new Promise((r) => setTimeout(r, 1500));
        const p = await store.getProject(state.projectId);
        if (!p) continue;
        setState(mapProjectToState(p));
        setGenerationPlan(p.generationPlan ?? null);
        await refreshAssets(state.projectId);
        if (p.generationStatus === "COMPLETED" || p.generationStatus === "FAILED_WITH_PARTIAL_ASSETS") break;
      }
    } catch (e: any) {
      console.error("[UI] Generation failed:", e);
    }
    setIsGenerating(false);
    loadCredits();
    refreshProjects();
  };

  const approveAndGenerateVideos = async () => {
    if (!auth.user) { auth.openAuth(); return; }
    if (!state?.projectId || !store) return;
    const videoCost = estimateCredits('videoPerSecond', (state.storyboard?.shots.length ?? 0) * VEO_CLIP_SECONDS);
    if (credits !== null && credits < videoCost) {
      setCreditBlock(`Need ${videoCost} credits for ${state.storyboard?.shots.length} video clips (you have ${credits}).`);
      setTimeout(() => setCreditBlock(null), 6000);
      return;
    }
    setIsGeneratingVideos(true);
    try {
      const idToken = await auth.user.getIdToken();
      await serverGenerateVideos(idToken, state.projectId, budgetUSD);
      for (;;) {
        await new Promise((r) => setTimeout(r, 2000));
        const p = await store.getProject(state.projectId);
        if (!p) continue;
        setState(mapProjectToState(p));
        await refreshAssets(state.projectId);
        if (p.videoGenerationStatus === "COMPLETED" || p.videoGenerationStatus === "FAILED_WITH_PARTIAL_ASSETS") break;
      }
    } finally {
      setIsGeneratingVideos(false);
      loadCredits();
      refreshProjects();
    }
  };

  const resetStuck = async (which: "images" | "videos") => {
    if (!auth.user || !state?.projectId || !store) return;
    try {
      await serverResetStuckGeneration(await auth.user.getIdToken(), state.projectId, which);
      const p = await store.getProject(state.projectId);
      if (p) setState(mapProjectToState(p));
    } catch (e: any) {
      console.error("[UI] reset stuck generation failed:", e);
    }
  };

  const retryAsset = async (assetId: string) => {
    if (!auth.user) { auth.openAuth(); return; }
    if (!state?.projectId || !store) return;
    try {
      const idToken = await auth.user.getIdToken();
      await serverRetryAsset(idToken, state.projectId, assetId, budgetUSD);
      await refreshAssets(state.projectId);
      const p = await store.getProject(state.projectId);
      if (p) setState(mapProjectToState(p));
      loadCredits();
    } catch (e) {
      console.error("[UI] Retry failed:", e);
    }
  };

  const runQC = async () => {
    if (!auth.user) { auth.openAuth(); return; }
    if (!state?.projectId || !store) return;
    await serverQCProject(await auth.user.getIdToken(), state.projectId, true);
    await refreshAssets(state.projectId);
  };

  const approveAsset = async (assetId: string) => {
    if (!auth.user) { auth.openAuth(); return; }
    if (!state?.projectId || !store) return;
    await serverApproveAsset(await auth.user.getIdToken(), state.projectId, assetId);
    await refreshAssets(state.projectId);
  };

  /**
   * Assets sitting behind a human decision.
   *
   * Two gates use the same rule and both used to fail silently: video rendering skips any shot
   * whose first frame is flagged, and assembly requires every clip to have passed QC. Either one
   * could leave the primary button quietly absent or inert with nothing on screen saying why.
   */
  const framesAwaitingReview = assets.filter(
    (a) => a.type === "IMAGE" && a.shotId && (a.qcStatus === "NEEDS_REVIEW" || a.qcStatus === "FAILED")
  );
  const clipsAwaitingReview = assets.filter(
    (a) => a.type === "VIDEO" && a.status === "COMPLETED" && a.qcStatus !== "PASSED"
  );
  const awaitingReview = [...framesAwaitingReview, ...clipsAwaitingReview];

  const [approvingAll, setApprovingAll] = useState(false);
  const approveAllFrames = async () => {
    if (!auth.user || !state?.projectId) return;
    setApprovingAll(true);
    try {
      const token = await auth.user.getIdToken();
      for (const a of awaitingReview) {
        await serverApproveAsset(token, state.projectId, a.id);
      }
      await refreshAssets(state.projectId);
    } finally {
      setApprovingAll(false);
    }
  };

  const assembleFilm = async () => {
    if (!auth.user) { auth.openAuth(); return; }
    if (!state?.projectId || !store) return;
    setIsAssembling(true);
    try {
      await serverAssembleFilm(await auth.user.getIdToken(), state.projectId);
      const p = await store.getProject(state.projectId);
      if (p) setState(mapProjectToState(p));
      await refreshAssets(state.projectId);
    } catch (e) {
      console.error("[UI] Assembly failed:", e);
    }
    setIsAssembling(false);
  };

  const generateDistribution = async () => {
    if (!auth.user) { auth.openAuth(); return; }
    if (!state?.projectId || !store) return;
    setIsDistributing(true);
    try {
      await serverGenerateDistribution(await auth.user.getIdToken(), state.projectId);
      const p = await store.getProject(state.projectId);
      if (p) {
        setState(mapProjectToState(p));
        setDistributionPackage(p.distributionPackage ?? null);
      }
    } catch (e) {
      console.error("[UI] Distribution failed:", e);
    }
    setIsDistributing(false);
    loadCredits();
  };

  const hasCreatives = !!(
    distributionPackage?.youtube.thumbnailImageUri ||
    distributionPackage?.instagram.coverImageUri ||
    distributionPackage?.pinterest.pinImageUri
  );

  const generateCreatives = async (force: boolean) => {
    if (!auth.user) { auth.openAuth(); return; }
    if (!state?.projectId || !store) return;
    if (credits !== null && credits < 15) {
      setCreditBlock("Need at least 15 credits to render platform creatives.");
      setTimeout(() => setCreditBlock(null), 6000);
      return;
    }
    setIsCreatives(true);
    try {
      await serverGenerateCreatives(await auth.user.getIdToken(), state.projectId, budgetUSD, force);
      const p = await store.getProject(state.projectId);
      if (p) { setState(mapProjectToState(p)); setDistributionPackage(p.distributionPackage ?? null); }
    } catch (e) { console.error("[UI] Creatives failed:", e); }
    setIsCreatives(false);
    loadCredits();
  };

  const generateVoiceover = async () => {
    if (!auth.user) { auth.openAuth(); return; }
    if (!state?.projectId || !store) return;
    if (credits !== null && credits < 2) {
      setCreditBlock("Voiceover needs 2 credits.");
      setTimeout(() => setCreditBlock(null), 6000);
      return;
    }
    setIsVoiceover(true);
    try {
      await serverGenerateVoiceover(await auth.user.getIdToken(), state.projectId);
      const p = await store.getProject(state.projectId);
      if (p) setState(mapProjectToState(p));
      await refreshAssets(state.projectId);
    } catch (e) {
      console.error("[UI] Voiceover failed:", e);
    }
    setIsVoiceover(false);
    loadCredits();
  };

  const mixAudio = async () => {
    if (!auth.user) { auth.openAuth(); return; }
    if (!state?.projectId || !store) return;
    setIsMixing(true);
    try {
      await serverMixAudio(await auth.user.getIdToken(), state.projectId);
      const p = await store.getProject(state.projectId);
      if (p) setState(mapProjectToState(p));
      await refreshAssets(state.projectId);
    } catch (e) {
      console.error("[UI] Mix failed:", e);
    }
    setIsMixing(false);
  };

  const copyField = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {}
  };

  const openTextKit = (platform: "youtube" | "instagram" | "pinterest") => {
    if (!auth.user) { auth.openAuth(); return; }
    if (!distributionPackage) return;
    const cfg =
      platform === "youtube" ? { uri: distributionPackage.youtube.thumbnailImageUri, w: 1280, h: 720 } :
      platform === "instagram" ? { uri: distributionPackage.instagram.coverImageUri, w: 896, h: 1120 } :
      { uri: distributionPackage.pinterest.pinImageUri, w: 832, h: 1248 };
    if (!cfg.uri) return;
    setTextKit({
      platform,
      imageUri: cfg.uri,
      w: cfg.w,
      h: cfg.h,
      layers: (distributionPackage as any).textOverlays?.[platform],
    });
  };

  const saveTextKit = async (dataUrl: string, layers: TextLayer[]) => {
    if (!auth.user) { auth.openAuth(); return; }
    if (!state?.projectId || !textKit || !store) return;
    try {
      await serverSaveTextCreative(await auth.user.getIdToken(), state.projectId, textKit.platform, dataUrl, layers);
      const p = await store.getProject(state.projectId);
      if (p) { setState(mapProjectToState(p)); setDistributionPackage(p.distributionPackage ?? null); }
    } catch (e) {
      console.error("[UI] TextKit save failed:", e);
    }
    setTextKit(null);
  };

  const framesReady = !!state?.storyboard &&
    state.storyboard.shots.length > 0 &&
    state.storyboard.shots.every((shot) =>
      assets.some((a) => a.shotId === shot.shotId && a.type === "IMAGE" && a.status === "COMPLETED")
    );

  const videosReady = !!state?.storyboard &&
    state.storyboard.shots.length > 0 &&
    state.storyboard.shots.every((shot) =>
      assets.some((a) => a.shotId === shot.shotId && a.type === "VIDEO" && a.status === "COMPLETED" && a.qcStatus === "PASSED")
    );

  const voiceoverAsset = assets.find((a) => a.id === state?.voiceoverAssetId);
  const filmAsset = assets.find((a) => a.id === state?.finalFilmAssetId);
  const voAlreadyMixed = !!state?.voiceoverAssetId && (filmAsset?.parentAssetIds ?? []).includes(state.voiceoverAssetId);

  const visibleProjects = auth.user ? projects.filter((p) => p.ownerUid === auth.user!.uid) : [];
  const filteredProjects = visibleProjects.filter((p) =>
    (p.title ?? "").toLowerCase().includes(projectQuery.toLowerCase())
  );

  const qcLabel = (status: string | undefined, issuesCount: number): string => {
    if (status === "PASSED" && issuesCount > 0) return "PASSED · HUMAN-APPROVED";
    return status ?? "—";
  };

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-zinc-950 font-sans text-zinc-100">
      <StudioTopBar
        modes={{ llm: llmMode, research: researchMode, image: imageMode, video: videoMode, vlm: vlmMode, dist: distMode, audio: audioMode, persistence: persistenceMode || undefined }}
        credits={credits}
        plan={plan}
        project={state?.worldBible ? { title: state.worldBible.title, status: state.stage } : null}
      />

      {/* Workspace: rail and canvas scroll independently on a desktop-sized viewport, and fall
          back to one ordinary document flow below lg where a fixed-height shell would trap content. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <aside className="w-full shrink-0 space-y-7 border-white/[0.07] p-5 lg:w-[340px] lg:overflow-y-auto lg:border-r">
          <Composer
            prompt={prompt} setPrompt={setPrompt}
            style={style} setStyle={setStyle}
            duration={duration} setDuration={setDuration}
            onRun={runPipeline} isRunning={isRunning}
            estimate={studioEstimate} credits={credits}
            signedIn={!!auth.user} creditBlock={creditBlock}
          />

          {state && (
            <div className="border-t border-white/[0.07] pt-6">
              <StageRail
                stages={Object.entries(STAGE_LABELS).map(([key, label]) => ({
                  key,
                  label,
                  active: state.stage === key,
                  done: !!(
                    (key === 'RESEARCH' && state.research) ||
                    (key === 'OPPORTUNITY' && state.opportunity) ||
                    (key === 'CREATIVE_DIRECTION' && state.worldBible) ||
                    (key === 'WORLD_BUILDING' && state.worldBible) ||
                    (key === 'STORYBOARDING' && state.storyboard) ||
                    (key === 'PRODUCTION_PLANNING' && state.productionPlan) ||
                    (key === 'COMPLETE' && state.stage === 'COMPLETE')
                  ),
                }))}
              />
              {state.stage === 'ERROR' && (
                <div className="mt-3 rounded-lg border border-red-900 bg-red-950/30 p-3 text-[11px] leading-relaxed text-red-300">
                  {state.error}
                </div>
              )}
            </div>
          )}

          {visibleProjects.length > 0 && (
            <div className="space-y-3 border-t border-white/[0.07] pt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                  Productions <span className="tabular-nums text-zinc-700">{visibleProjects.length}</span>
                </h3>
                <button
                  onClick={restoreArchive}
                  className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 transition-colors hover:text-zinc-300"
                >
                  ↺ Restore
                </button>
              </div>
              <div className="relative">
                <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
                <input
                  value={projectQuery}
                  onChange={(e) => setProjectQuery(e.target.value)}
                  placeholder="Search productions"
                  aria-label="Search productions"
                  className="w-full rounded-lg border border-white/[0.09] bg-white/[0.03] py-2 pl-7 pr-2 text-[12px] text-zinc-200 placeholder:text-zinc-600 transition-colors focus:border-cyan-500/50 focus:outline-none"
                />
              </div>
              <div className="space-y-2">
                {filteredProjects.length === 0 ? (
                  <p className="py-2 text-[11px] text-zinc-600">No matching productions.</p>
                ) : (
                  filteredProjects.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      active={state?.projectId === p.id}
                      onOpen={() => loadProject(p.id)}
                      onDelete={(e) => deleteProject(p.id, e)}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </aside>

        <div className="min-w-0 flex-1 px-5 pb-16 lg:overflow-y-auto">
          {!state ? (
            <EmptyCanvas />
          ) : (
            <div className="fade-in">
              <WorkspaceTabs tabs={workTabs} active={activeTab} onChange={selectTab} />
              <div className="space-y-10">

              {/* Where the production actually begins: a real opportunity read off the live web
                  before a single frame exists. Every claim here is a citation you can open. */}
              {activeTab === "story" && state.research && (
                <section className="space-y-3">
                  <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.07] pb-2">
                    <h3 className="text-xs uppercase tracking-widest text-zinc-500">Research signals</h3>
                    <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-cyan-400">
                      <span className="h-1 w-1 rounded-full bg-cyan-400" />
                      via {researchMode}
                      {/* The upstream search id, so a run can be traced back to the exact
                          Parallel call that produced its evidence. Mock mode has none. */}
                      {state.researchSearchIds?.[0] && (
                        <span className="ml-1 truncate text-zinc-600 normal-case" title={state.researchSearchIds.join(", ")}>
                          {state.researchSearchIds[0]}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="grid gap-2.5">
                    {state.research.trendingTopics.map((t, i) => {
                      const pct = Math.round(t.signalStrength * 100);
                      return (
                        <div key={i} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 transition-colors hover:border-white/[0.12]">
                          <div className="flex items-start justify-between gap-4">
                            <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-zinc-100">{t.topic}</p>
                            <div className="flex shrink-0 items-center gap-2">
                              <div className="h-1 w-14 overflow-hidden rounded-full bg-white/[0.08]">
                                <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500" style={{ width: `${Math.min(100, pct)}%` }} />
                              </div>
                              <span className="w-8 text-right text-[10px] font-mono tabular-nums text-cyan-400">{pct}%</span>
                            </div>
                          </div>
                          <ul className="mt-2.5 space-y-1">
                            {t.sources.map((s, j) => (
                              <li key={j}>
                                {s.url.includes("mock.worldsmith.dev") ? (
                                  <span className="block truncate text-[11px] text-zinc-600" title="Simulated source (mock research mode)">
                                    ⌁ {s.title} · simulated
                                  </span>
                                ) : (
                                  <a href={s.url} target="_blank" rel="noreferrer"
                                    className="group block rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:bg-white/[0.03]">
                                    <span className="block truncate text-[11px] text-zinc-500 transition-colors group-hover:text-cyan-300">
                                      ↗ {s.title}
                                    </span>
                                    {/* The retrieved passage itself. This is what the synthesis
                                        step actually reasoned over, so showing it is the
                                        difference between a citation and a claim of one. */}
                                    {s.snippet && (
                                      <span className="mt-0.5 line-clamp-2 block text-[11px] leading-relaxed text-zinc-600">
                                        {s.snippet}
                                      </span>
                                    )}
                                  </a>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {activeTab === "story" && state.worldBible && (
                <section className="space-y-6">
                  <div className="border-l-2 border-zinc-700 pl-6">
                    <h2 className="text-2xl font-light tracking-tight text-white">{state.worldBible.title}</h2>
                    <p className="text-zinc-400 mt-2 italic text-sm">{state.worldBible.premise}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-zinc-900 p-4 rounded border border-zinc-800">
                      <h4 className="text-[10px] uppercase text-zinc-500 mb-2 tracking-widest">Visual Style</h4>
                      <p className="text-sm text-zinc-300">{state.worldBible.visualStyle.artDirection}</p>
                      <p className="text-xs text-zinc-500 mt-2">Lighting: {state.worldBible.visualStyle.lighting}</p>
                    </div>
                    <div className="bg-zinc-900 p-4 rounded border border-zinc-800">
                      <h4 className="text-[10px] uppercase text-zinc-500 mb-2 tracking-widest">Characters</h4>
                      {state.worldBible.characters.map((c, i) => (
                        <div key={i} className="mb-2">
                          <p className="text-sm font-semibold text-zinc-200">{c.name}</p>
                          <p className="text-xs text-zinc-500">{c.role}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {activeTab === "story" && state.storyboard && (
                <section className="space-y-4">
                  <h3 className="text-xs uppercase tracking-widest text-zinc-500 border-b border-white/[0.07] pb-2">Cinematic Storyboard</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {state.storyboard.shots.map((shot, i) => (
                      <div key={i} className="border border-white/[0.07] bg-white/[0.02] p-4 rounded-lg space-y-3 hover:border-zinc-700 transition-colors">
                         <div className="flex justify-between items-center">
                            <span className="text-[10px] font-mono text-zinc-500">SHOT {shot.shotId}</span>
                            <span className="text-[10px] font-mono text-blue-400">{shot.duration}</span>
                         </div>
                         <p className="text-sm text-zinc-300 leading-relaxed">{shot.action}</p>
                         <div className="text-[10px] text-zinc-500 border-t border-white/[0.07] pt-2 space-y-1">
                            <p><span className="font-semibold text-zinc-400">Camera:</span> {shot.camera}</p>
                            <p><span className="font-semibold text-zinc-400">Lighting:</span> {shot.lighting}</p>
                         </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {activeTab === "assets" && state.productionPlan && (
                <section className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
                  <div className="grid grid-cols-2 divide-x divide-white/[0.07] border-b border-white/[0.07] sm:grid-cols-4">
                    {[
                      { k: "Est. cost", v: `$${state.productionPlan.estimatedCostUSD.toFixed(2)}`, tone: "text-emerald-400" },
                      { k: "Shots", v: String(state.productionPlan.totalShots), tone: "text-zinc-100" },
                      { k: "Runtime", v: state.productionPlan.estimatedDuration, tone: "text-zinc-100" },
                      { k: "Engine", v: "Veo 3.1", tone: "text-cyan-400" },
                    ].map((m) => (
                      <div key={m.k} className="p-4">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{m.k}</p>
                        <p className={`mt-1 text-xl font-mono tabular-nums ${m.tone}`}>{m.v}</p>
                      </div>
                    ))}
                  </div>
                  <div className="p-5">
                    <p className="mb-3 text-[10px] font-mono uppercase tracking-widest text-zinc-500">Routing strategy</p>
                    <ol className="space-y-2">
                      {routingSteps(state.productionPlan.routingStrategy).map((step, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="mt-px shrink-0 font-mono text-[10px] tabular-nums text-zinc-600">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="text-[12.5px] leading-relaxed text-zinc-400">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </section>
              )}

              {activeTab === "assets" && !isGenerating && state?.generationStatus === "GENERATING" && (
                <div className="flex items-center justify-between gap-3 text-xs font-mono p-3 rounded border border-amber-800 text-amber-300 bg-amber-950/30">
                  <span>⚠ This asset run looks stuck (no active progress in this session).</span>
                  <button onClick={() => resetStuck("images")} className="px-3 py-1 border border-amber-700 rounded hover:bg-amber-900/30 uppercase tracking-widest">Reset & retry</button>
                </div>
              )}
              {activeTab === "assets" && !isGeneratingVideos && state?.videoGenerationStatus === "GENERATING" && (
                <div className="flex items-center justify-between gap-3 text-xs font-mono p-3 rounded border border-amber-800 text-amber-300 bg-amber-950/30">
                  <span>⚠ This video run looks stuck (no active progress in this session).</span>
                  <button onClick={() => resetStuck("videos")} className="px-3 py-1 border border-amber-700 rounded hover:bg-amber-900/30 uppercase tracking-widest">Reset & retry</button>
                </div>
              )}
              {activeTab === "assets" && generationPlan && !isGenerating && state?.generationStatus !== "COMPLETED" && state?.generationStatus !== "FAILED_WITH_PARTIAL_ASSETS" && (
                <section className="bg-white/[0.02] border border-emerald-900/50 p-6 rounded-xl space-y-4">
                  <h3 className="text-xs uppercase tracking-widest text-emerald-400">Generation Plan</h3>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div><p className="text-[10px] text-zinc-500 uppercase">Characters</p><p className="text-xl font-mono text-zinc-200">{generationPlan.characterRefs}</p></div>
                    <div><p className="text-[10px] text-zinc-500 uppercase">Locations</p><p className="text-xl font-mono text-zinc-200">{generationPlan.locationRefs}</p></div>
                    <div><p className="text-[10px] text-zinc-500 uppercase">Props</p><p className="text-xl font-mono text-zinc-200">{generationPlan.propRefs}</p></div>
                    <div><p className="text-[10px] text-zinc-500 uppercase">First Frames</p><p className="text-xl font-mono text-zinc-200">{generationPlan.shotFirstFrames}</p></div>
                  </div>
                  <div className="border-t border-white/[0.07] pt-4 grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase">Total Assets</p>
                      <p className="text-2xl font-mono text-zinc-200">{generationPlan.totalAssets}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase">Estimated Cost</p>
                      <p className="text-2xl font-mono text-green-400">${generationPlan.estimatedCostUSD.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase">Provider</p>
                      <p className="text-sm font-mono text-zinc-300">{generationPlan.imageProvider}/{generationPlan.imageModel}</p>
                    </div>
                  </div>
                  <div className="border-t border-white/[0.07] pt-3">
                    <p className="text-[10px] font-mono text-zinc-500">
                      Credit cost: <span className="text-cyan-400">{(generationPlan.totalAssets ?? 0) * 5} credits</span>
                      {credits !== null && <span> · you have {credits}</span>}
                    </p>
                  </div>
                  <div className="flex items-end gap-4 border-t border-white/[0.07] pt-4">
                    <div className="flex-1">
                      <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Budget (USD)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={budgetUSD}
                        onChange={(e) => setBudgetUSD(parseFloat(e.target.value) || 0)}
                        className="w-full border border-white/[0.07] bg-white/[0.02] rounded p-2 text-sm text-zinc-300"
                      />
                    </div>
                    <button
                      onClick={approveAndGenerate}
                      disabled={generationPlan.estimatedCostUSD > budgetUSD || !generationPlan.totalAssets}
                      className="px-6 py-3 bg-emerald-500 text-black font-semibold rounded hover:bg-emerald-400 tracking-widest uppercase text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Generate Assets
                    </button>
                  </div>
                  {generationPlan.estimatedCostUSD > budgetUSD && (
                    <BudgetBlock need={generationPlan.estimatedCostUSD} budget={budgetUSD} onRaise={setBudgetUSD} />
                  )}
                </section>
              )}

              {/* The video stage silently skips any shot whose first frame is flagged, which meant
                  clicking Generate Videos could do nothing at all with no explanation. Say so, and
                  offer the one action that unblocks it. */}
              {activeTab === "assets" && awaitingReview.length > 0 && (
                <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-900/60 bg-amber-950/25 p-4">
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-amber-300">
                      {awaitingReview.length} asset{awaitingReview.length === 1 ? "" : "s"} awaiting your approval
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-amber-300/70">
                      {framesAwaitingReview.length > 0 && (
                        <>
                          {framesAwaitingReview.length} first frame{framesAwaitingReview.length === 1 ? "" : "s"} — video
                          rendering skips {framesAwaitingReview.length === 1 ? "a flagged frame" : "flagged frames"} so Veo
                          time is never spent on a shot you might reject.{" "}
                        </>
                      )}
                      {clipsAwaitingReview.length > 0 && (
                        <>
                          {clipsAwaitingReview.length} clip{clipsAwaitingReview.length === 1 ? "" : "s"} — the final cut
                          waits until every clip has passed continuity QC.
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={approveAllFrames}
                    disabled={approvingAll}
                    className="shrink-0 rounded-md bg-amber-500 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-black transition-colors hover:bg-amber-400 disabled:opacity-50"
                  >
                    {approvingAll ? "Approving…" : `Approve all ${awaitingReview.length}`}
                  </button>
                </section>
              )}

              {activeTab === "assets" && generationPlan && generationPlan.videoClips != null && (
                <section className="bg-white/[0.02] border border-amber-900/50 p-6 rounded-xl space-y-4">
                  <h3 className="text-xs uppercase tracking-widest text-amber-400">Video Plan</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div><p className="text-[10px] text-zinc-500 uppercase">Video Clips</p><p className="text-xl font-mono text-zinc-200">{generationPlan.videoClips}</p></div>
                    <div><p className="text-[10px] text-zinc-500 uppercase">Video Est.</p><p className="text-xl font-mono text-amber-400">${(generationPlan.videoEstimatedCostUSD ?? 0).toFixed(2)}</p></div>
                    <div><p className="text-[10px] text-zinc-500 uppercase">Video Model</p><p className="text-sm font-mono text-zinc-300">{generationPlan.videoProvider}/{generationPlan.videoModel}</p></div>
                  </div>

                  <p className="text-[10px] text-zinc-500 font-mono leading-relaxed border-t border-white/[0.07] pt-3">
                    Note: Veo 3 renders fixed 8s clips; shots are trimmed to storyboard length during final assembly.
                  </p>

                  <div className="border-t border-white/[0.07] pt-3">
                    <p className="text-[10px] font-mono text-zinc-500">
                      Credit cost: <span className="text-cyan-400">{estimateCredits('videoPerSecond', (state.storyboard?.shots.length ?? 0) * VEO_CLIP_SECONDS)} credits</span>
                      {credits !== null && <span> · you have {credits}</span>}
                    </p>
                  </div>

                  <div className="flex items-end gap-4">
                    <div className="flex-1">
                      <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Budget (USD)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={budgetUSD}
                        onChange={(e) => setBudgetUSD(parseFloat(e.target.value) || 0)}
                        className="w-full border border-white/[0.07] bg-white/[0.02] rounded p-2 text-sm text-zinc-300"
                      />
                    </div>
                    <button
                      onClick={approveAndGenerateVideos}
                      disabled={
                        isGeneratingVideos ||
                        !(state?.generationStatus === "COMPLETED" || framesReady) ||
                        state?.videoGenerationStatus === "COMPLETED" ||
                        (generationPlan.videoEstimatedCostUSD ?? 0) > budgetUSD
                      }
                      className="px-6 py-3 bg-amber-500 text-black font-semibold rounded hover:bg-amber-400 tracking-widest uppercase text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Generate Videos
                    </button>
                  </div>
                  {(generationPlan.videoEstimatedCostUSD ?? 0) > budgetUSD && (
                    <BudgetBlock need={generationPlan.videoEstimatedCostUSD ?? 0} budget={budgetUSD} onRaise={setBudgetUSD} />
                  )}

                  {(generationPlan.videoEstimatedCostUSD ?? 0) > budgetUSD && state?.videoGenerationStatus !== "COMPLETED" && (
                    <p className="text-red-400 text-xs font-mono">⚠ Video estimate exceeds budget — raise the budget to enable.</p>
                  )}
                  {state?.videoGenerationStatus === "COMPLETED" && (
                    <p className="text-emerald-400 text-xs font-mono">✓ Videos completed for this production.</p>
                  )}
                  {state?.videoGenerationStatus === "COMPLETED" && videosReady && !state?.finalFilmAssetId && (
                    <button
                      onClick={assembleFilm}
                      disabled={isAssembling}
                      className="px-6 py-3 bg-emerald-500 text-black font-semibold rounded hover:bg-emerald-400 tracking-widest uppercase text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isAssembling ? "Assembling..." : "Assemble Final Film"}
                    </button>
                  )}
                  {isGeneratingVideos && (
                    <div className="space-y-2">
                      <p className="text-amber-400 text-xs font-mono uppercase tracking-widest animate-pulse">Rendering video clips (minutes per shot)...</p>
                      <SkeletonCard lines={1} image />
                    </div>
                  )}
                </section>
              )}

              {activeTab === "film" && state?.finalFilmAssetId && (() => {
                const film = assets.find((a) => a.id === state.finalFilmAssetId);
                if (!film?.uri) return null;
                // The payoff of the whole pipeline, so it gets the room: a full-bleed player on
                // black rather than a bordered card, with the metadata reading as a credit slate
                // underneath instead of competing with the picture.
                return (
                  <section className="space-y-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <h3 className="text-xs uppercase tracking-widest text-emerald-400">Final film</h3>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">
                        {state.storyboard?.shots.length ?? 0} shots · {state.storyboard?.shots.reduce((n, sh) => n + (parseInt(sh.duration) || 0), 0) ?? 0}s · FFmpeg cut
                      </span>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-white/[0.09] bg-black">
                      <video src={film.uri} controls playsInline className="block aspect-video w-full bg-black" />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => downloadFromUri(film.uri!, assetFilename("film", `${state?.worldBible?.title ?? "final film"}`))}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-black transition-colors hover:bg-emerald-400"
                      >
                        <Download size={11} /> Download film
                      </button>
                    </div>
                    <p className="text-[10px] font-mono leading-relaxed text-zinc-600">
                      Assembled deterministically with FFmpeg · {film.prompt}
                    </p>
                  </section>
                );
              })()}

              {activeTab === "film" && state?.finalFilmAssetId && (
                <section className="bg-white/[0.02] border border-fuchsia-900/50 p-6 rounded-xl space-y-4">
                  <h3 className="text-xs uppercase tracking-widest text-fuchsia-400">Audio Layer</h3>
                  <p className="text-[10px] text-zinc-500">
                    Ambience & SFX: native Veo audio kept in assembly. Narration: Gemini TTS from the package's narrationScript.
                  </p>
                  <div className="flex flex-wrap gap-3 items-center">
                    <button
                      onClick={generateVoiceover}
                      disabled={isVoiceover || !distributionPackage?.generic.narrationScript}
                      className="px-4 py-2 bg-fuchsia-500 text-black font-semibold rounded hover:bg-fuchsia-400 tracking-widest uppercase text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isVoiceover ? "Synthesizing..." : "Generate Voiceover · 2 credits"}
                    </button>
                    {state.voiceoverAssetId && !voAlreadyMixed && (
                      <button onClick={mixAudio} disabled={isMixing}
                      className="px-4 py-2 border border-fuchsia-800 rounded hover:bg-fuchsia-950/30 text-fuchsia-400 uppercase tracking-widest text-xs font-mono disabled:opacity-50">
                        {isMixing ? "Mixing..." : "Mix Into Film"}
                      </button>
                    )}
                    {voAlreadyMixed && (
                      <p className="text-emerald-400 text-xs font-mono">✓ Narration mixed into the final film above.</p>
                    )}
                  </div>
                  {!distributionPackage?.generic.narrationScript && (
                    <p className="text-zinc-500 text-[10px] font-mono">
                      No narrationScript in this package — regenerate the distribution package to unlock voiceover.
                    </p>
                  )}
                  {voiceoverAsset?.uri && (
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-widest text-zinc-500">Narration · {voiceoverAsset.provider}</span>
                      <audio src={voiceoverAsset.uri} controls className="w-full" />
                      <button
                        onClick={() => downloadFromUri(voiceoverAsset.uri!, assetFilename("narration", `${state?.worldBible?.title ?? ""} narration`))}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest border border-fuchsia-800 rounded text-fuchsia-400 hover:bg-fuchsia-950/30 transition-colors"
                      >
                        <Download size={11} /> Download audio
                      </button>
                      <p className="text-[10px] font-mono text-zinc-500 italic">"{voiceoverAsset.prompt}"</p>
                    </div>
                  )}
                </section>
              )}

              {activeTab === "distribute" && state?.finalFilmAssetId && (
                <section className="bg-white/[0.02] border border-cyan-900/50 p-6 rounded-xl space-y-4">
                  <div className="flex justify-between items-start gap-3 flex-wrap">
                    <div>
                      <h3 className="text-xs uppercase tracking-widest text-cyan-400">Distribution Package</h3>
                      <p className="text-[10px] text-zinc-500 mt-1">
                        All copy derived from the production's World Bible, storyboard, and research signals.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {distributionPackage && (
                        <button
                          onClick={() => generateCreatives(hasCreatives)}
                          disabled={isCreatives}
                          className="px-4 py-2 border border-cyan-800 rounded hover:bg-cyan-950/30 text-cyan-400 uppercase tracking-widest text-[10px] font-mono disabled:opacity-50"
                        >
                          {isCreatives ? "Rendering..." : hasCreatives ? "Regenerate Creatives" : "Generate Creatives"}
                        </button>
                      )}
                      {!distributionPackage && (
                        <button
                          onClick={generateDistribution}
                          disabled={isDistributing}
                          className="px-4 py-2 bg-cyan-500 text-black font-semibold rounded hover:bg-cyan-400 tracking-widest uppercase text-xs disabled:opacity-50"
                        >
                          {isDistributing ? "Generating..." : "Generate Distribution"}
                        </button>
                      )}
                    </div>
                  </div>

                  {isDistributing && (
                    <div className="space-y-2">
                      <p className="text-cyan-400 text-xs font-mono uppercase tracking-widest animate-pulse">
                        Building cross-platform campaign...
                      </p>
                      <SkeletonCard lines={4} />
                    </div>
                  )}

                  {distributionPackage && (
                    <>
                      <div className="flex flex-wrap gap-1 border-t border-white/[0.07] pt-3">
                        {["youtube", "instagram", "tiktok", "pinterest", "x", "linkedin", "facebook", "generic"].map((tab) => (
                          <button
                            key={tab}
                            onClick={() => setActiveDistTab(tab)}
                            className={`px-3 py-1 text-[10px] font-mono uppercase tracking-widest rounded border transition-colors ${
                              activeDistTab === tab
                                ? "border-cyan-700 text-cyan-300 bg-cyan-950/30"
                                : "border-zinc-800 text-zinc-500 hover:border-zinc-700"
                            }`}
                          >
                            {tab === "x" ? "X" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                          </button>
                        ))}
                      </div>

                      <div className="space-y-3 border-t border-white/[0.07] pt-4">
                        {activeDistTab === "youtube" && (
                          <>
                            <DistField label="Title Options" values={distributionPackage.youtube.titles} onCopy={copyField} copiedKey={copiedKey} prefix="yt-title" />
                            <DistField label="Description" value={distributionPackage.youtube.description} onCopy={copyField} copiedKey={copiedKey} k="yt-desc" />
                            <DistField label="Tags" values={distributionPackage.youtube.tags} onCopy={copyField} copiedKey={copiedKey} prefix="yt-tag" joined />
                            <DistField label="Thumbnail Concept" value={distributionPackage.youtube.thumbnailConcept} onCopy={copyField} copiedKey={copiedKey} k="yt-thumb" />
                            {distributionPackage.youtube.thumbnailImageUri && (
                              <div className="space-y-1">
                                <span className="text-[10px] uppercase tracking-widest text-zinc-500">Generated Thumbnail</span>
                                <img src={distributionPackage.youtube.thumbnailImageUri} alt="YouTube thumbnail" className="w-full aspect-video object-cover rounded border border-zinc-800" />
                                <div className="grid grid-cols-2 gap-1 mt-1">
                                  <button onClick={() => openTextKit("youtube")}
                                    className="py-1 text-[10px] font-mono uppercase tracking-widest border border-cyan-800 rounded hover:bg-cyan-950/30 text-cyan-400">
                                    ✎ Edit Text
                                  </button>
                                  <button onClick={() => downloadFromUri(distributionPackage.youtube.thumbnailImageUri!, assetFilename("youtube", `youtube ${state?.worldBible?.title ?? ""}`))}
                                    className="py-1 text-[10px] font-mono uppercase tracking-widest border border-zinc-700 rounded hover:bg-zinc-800 text-zinc-300">
                                    ⬇ Download
                                  </button>
                                </div>
                              </div>
                            )}
                            <DistField label="Shorts Title" value={distributionPackage.youtube.shortsTitle} onCopy={copyField} copiedKey={copiedKey} k="yt-st" />
                            <DistField label="Shorts Description" value={distributionPackage.youtube.shortsDescription} onCopy={copyField} copiedKey={copiedKey} k="yt-sd" />
                          </>
                        )}
                        {activeDistTab === "instagram" && (
                          <>
                            <DistField label="Reel Caption" value={distributionPackage.instagram.reelCaption} onCopy={copyField} copiedKey={copiedKey} k="ig-rc" />
                            <DistField label="Hook" value={distributionPackage.instagram.hook} onCopy={copyField} copiedKey={copiedKey} k="ig-hook" />
                            <DistField label="Hashtags" values={distributionPackage.instagram.hashtags} onCopy={copyField} copiedKey={copiedKey} prefix="ig-tag" joined />
                            <DistField label="Cover Concept" value={distributionPackage.instagram.coverConcept} onCopy={copyField} copiedKey={copiedKey} k="ig-cover" />
                            {distributionPackage.instagram.coverImageUri && (
                              <div className="space-y-1">
                                <span className="text-[10px] uppercase tracking-widest text-zinc-500">Generated Cover</span>
                                <img src={distributionPackage.instagram.coverImageUri} alt="Instagram cover" className="w-full aspect-[4/5] object-cover rounded border border-zinc-800" />
                                <div className="grid grid-cols-2 gap-1 mt-1">
                                  <button onClick={() => openTextKit("instagram")}
                                    className="py-1 text-[10px] font-mono uppercase tracking-widest border border-cyan-800 rounded hover:bg-cyan-950/30 text-cyan-400">
                                    ✎ Edit Text
                                  </button>
                                  <button onClick={() => downloadFromUri(distributionPackage.instagram.coverImageUri!, assetFilename("instagram", `instagram ${state?.worldBible?.title ?? ""}`))}
                                    className="py-1 text-[10px] font-mono uppercase tracking-widest border border-zinc-700 rounded hover:bg-zinc-800 text-zinc-300">
                                    ⬇ Download
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                        {activeDistTab === "tiktok" && (
                          <>
                            <DistField label="Caption" value={distributionPackage.tiktok.caption} onCopy={copyField} copiedKey={copiedKey} k="tt-cap" />
                            <DistField label="Hook" value={distributionPackage.tiktok.hook} onCopy={copyField} copiedKey={copiedKey} k="tt-hook" />
                            <DistField label="Hashtags" values={distributionPackage.tiktok.hashtags} onCopy={copyField} copiedKey={copiedKey} prefix="tt-tag" joined />
                          </>
                        )}
                        {activeDistTab === "pinterest" && (
                          <>
                            <DistField label="Pin Title" value={distributionPackage.pinterest.pinTitle} onCopy={copyField} copiedKey={copiedKey} k="pt-title" />
                            <DistField label="Pin Description" value={distributionPackage.pinterest.pinDescription} onCopy={copyField} copiedKey={copiedKey} k="pt-desc" />
                            <DistField label="Pin Concept" value={distributionPackage.pinterest.pinConcept} onCopy={copyField} copiedKey={copiedKey} k="pt-con" />
                            {distributionPackage.pinterest.pinImageUri && (
                              <div className="space-y-1">
                                <span className="text-[10px] uppercase tracking-widest text-zinc-500">Generated Pin</span>
                                <img src={distributionPackage.pinterest.pinImageUri} alt="Pinterest pin" className="w-full aspect-[2/3] object-cover rounded border border-zinc-800" />
                                <div className="grid grid-cols-2 gap-1 mt-1">
                                  <button onClick={() => openTextKit("pinterest")}
                                    className="py-1 text-[10px] font-mono uppercase tracking-widest border border-cyan-800 rounded hover:bg-cyan-950/30 text-cyan-400">
                                    ✎ Edit Text
                                  </button>
                                  <button onClick={() => downloadFromUri(distributionPackage.pinterest.pinImageUri!, assetFilename("pinterest", `pinterest ${state?.worldBible?.title ?? ""}`))}
                                    className="py-1 text-[10px] font-mono uppercase tracking-widest border border-zinc-700 rounded hover:bg-zinc-800 text-zinc-300">
                                    ⬇ Download
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                        {activeDistTab === "x" && (
                          <>
                            <DistField label="Short Post" value={distributionPackage.x.shortPost} onCopy={copyField} copiedKey={copiedKey} k="x-short" />
                            <DistField label="Thread" values={distributionPackage.x.thread} onCopy={copyField} copiedKey={copiedKey} prefix="x-thread" />
                            <DistField label="Launch Post" value={distributionPackage.x.launchPost} onCopy={copyField} copiedKey={copiedKey} k="x-launch" />
                          </>
                        )}
                        {activeDistTab === "linkedin" && (
                          <>
                            <DistField label="Professional Post" value={distributionPackage.linkedin.professionalPost} onCopy={copyField} copiedKey={copiedKey} k="li-pro" />
                            <DistField label="Creator Angle" value={distributionPackage.linkedin.creatorAngle} onCopy={copyField} copiedKey={copiedKey} k="li-angle" />
                          </>
                        )}
                        {activeDistTab === "facebook" && (
                          <DistField label="Caption" value={distributionPackage.facebook.caption} onCopy={copyField} copiedKey={copiedKey} k="fb-cap" />
                        )}
                        {activeDistTab === "generic" && (
                          <>
                            <DistField label="Teaser Copy" value={distributionPackage.generic.teaserCopy} onCopy={copyField} copiedKey={copiedKey} k="gen-teaser" />
                            <DistField label="Trailer Copy" value={distributionPackage.generic.trailerCopy} onCopy={copyField} copiedKey={copiedKey} k="gen-trailer" />
                            <DistField label="Narration Script" value={distributionPackage.generic.narrationScript} onCopy={copyField} copiedKey={copiedKey} k="gen-narr" />
                            <DistField label="Quote Card Ideas" values={distributionPackage.generic.quoteCardIdeas} onCopy={copyField} copiedKey={copiedKey} prefix="gen-quote" />
                            <DistField label="Community Post" value={distributionPackage.generic.communityPost} onCopy={copyField} copiedKey={copiedKey} k="gen-comm" />
                            <DistField label="Alternate Hooks" values={distributionPackage.generic.alternateHooks} onCopy={copyField} copiedKey={copiedKey} prefix="gen-hook" />
                          </>
                        )}
                      </div>

                      <button
                        onClick={generateDistribution}
                        disabled={isDistributing}
                        className="px-4 py-2 border border-cyan-800 rounded hover:bg-cyan-950/30 text-cyan-400 uppercase tracking-widest text-[10px] font-mono disabled:opacity-50"
                      >
                        {isDistributing ? "Regenerating..." : "Regenerate Package"}
                      </button>
                    </>
                  )}
                </section>
              )}

              {activeTab === "assets" && isGenerating && (
                <section className="bg-white/[0.02] border border-amber-900/50 p-6 rounded-xl space-y-3">
                  <p className="text-amber-400 text-xs font-mono uppercase tracking-widest animate-pulse">Generating assets...</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <SkeletonCard lines={2} image />
                    <SkeletonCard lines={2} image />
                    <SkeletonCard lines={2} image />
                  </div>
                </section>
              )}

              {activeTab === "assets" && assets.length > 0 && (
                <section className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-3">
                    <h3 className="text-xs uppercase tracking-widest text-zinc-500">Asset gallery</h3>
                    <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono uppercase tracking-widest">
                      {(() => {
                        const ok = assets.filter((a) => a.status === "COMPLETED").length;
                        const failed = assets.filter((a) => a.status === "FAILED").length;
                        const review = assets.filter((a) => a.qcStatus === "NEEDS_REVIEW").length;
                        return (
                          <>
                            <span className="text-emerald-400 tabular-nums">{ok} ready</span>
                            {review > 0 && <span className="text-amber-400 tabular-nums">{review} to review</span>}
                            {failed > 0 && <span className="text-red-400 tabular-nums">{failed} failed</span>}
                            <span className="text-zinc-600 tabular-nums">
                              ${assets.reduce((sum, a) => sum + (a.costUSD ?? 0), 0).toFixed(2)} spent
                            </span>
                          </>
                        );
                      })()}
                      <button
                        onClick={runQC}
                        className="rounded-md border border-white/[0.09] px-2.5 py-1 text-purple-300 transition-colors hover:border-purple-700 hover:bg-purple-950/30"
                      >
                        Run QC
                      </button>
                    </div>
                  </div>

                  {assets.filter((a) => a.characterId && !a.shotId && a.type === "IMAGE").length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] uppercase tracking-widest text-zinc-500">Character References</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {assets.filter((a) => a.characterId && !a.shotId && a.type === "IMAGE").map((a) => (
                          <AssetCard key={a.id} asset={a} onRetry={() => retryAsset(a.id)} onApprove={() => approveAsset(a.id)} />
                        ))}
                      </div>
                    </div>
                  )}

                  {assets.filter((a) => a.locationId && !a.shotId && a.type === "IMAGE").length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] uppercase tracking-widest text-zinc-500">Environment Plates</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {assets.filter((a) => a.locationId && !a.shotId && a.type === "IMAGE").map((a) => (
                          <AssetCard key={a.id} asset={a} onRetry={() => retryAsset(a.id)} onApprove={() => approveAsset(a.id)} />
                        ))}
                      </div>
                    </div>
                  )}

                  {state?.storyboard && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] uppercase tracking-widest text-zinc-500">Shot First Frames & Video</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {state.storyboard.shots.map((shot) => {
                          const frame = assets.find((a) => a.shotId === shot.shotId && a.type === "IMAGE");
                          const vid = assets.find((a) => a.shotId === shot.shotId && a.type === "VIDEO");
                          return (
                            <div key={shot.shotId} className="border border-white/[0.07] bg-white/[0.02] rounded-lg p-3 space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] font-mono text-zinc-500">SHOT {shot.shotId}</span>
                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                                  frame?.status === "COMPLETED" ? "text-emerald-400 bg-emerald-950/30" :
                                  frame?.status === "FAILED" ? "text-red-400 bg-red-950/30" :
                                  "text-zinc-500"
                                }`}>
                                  {frame?.status ?? "PENDING"}
                                </span>
                              </div>
                              {frame?.uri ? (
                                <div className="group relative">
                                  <img src={frame.uri} alt={`Shot ${shot.shotId}`} className="w-full aspect-video object-cover rounded bg-zinc-950" />
                                  <button
                                    onClick={() => downloadFromUri(frame.uri!, assetFilename("frame", frame.prompt || shot.generationPrompt))}
                                    title="Download"
                                    className="absolute inset-0 m-auto w-8 h-8 rounded-full bg-zinc-950/80 border border-zinc-700 flex items-center justify-center text-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-zinc-800"
                                  >
                                    <Download size={14} />
                                  </button>
                                </div>
                              ) : (
                                <div className="w-full aspect-video bg-zinc-950 rounded flex items-center justify-center text-zinc-600 text-xs">awaiting</div>
                              )}
                              <p className="text-xs text-zinc-400 line-clamp-2">{shot.action}</p>
                              <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500">
                                <span>{frame?.provider ?? "—"}/{frame?.model ?? "—"}</span>
                                <span>${(frame?.costUSD ?? 0).toFixed(2)}</span>
                              </div>
                              {frame && (
                                <button onClick={() => retryAsset(frame.id)} className="w-full text-[10px] font-mono uppercase tracking-widest py-1 border border-zinc-700 rounded hover:bg-zinc-800 text-zinc-400">
                                  Retry Frame
                                </button>
                              )}

                              {frame?.qcStatus && (
                                <div className={`text-[10px] font-mono px-2 py-1 rounded border ${
                                  frame.qcStatus === "PASSED" ? "text-emerald-400 border-emerald-900 bg-emerald-950/20" : "text-amber-400 border-amber-900 bg-amber-950/20"
                                }`}>
                                  FRAME QC · {qcLabel(frame.qcStatus, frame.qcReport?.issues?.length ?? 0)}{frame.qcReport ? ` · ${(frame.qcReport.confidence * 100).toFixed(0)}%` : ""}
                                  {frame.qcReport?.issues?.length ? ` — ${frame.qcReport.issues[0]}` : ""}
                                </div>
                              )}
                              {frame?.qcStatus === "NEEDS_REVIEW" && (
                                <button onClick={() => approveAsset(frame.id)} className="w-full text-[10px] font-mono uppercase tracking-widest py-1 border border-amber-700 rounded hover:bg-amber-900/30 text-amber-400">
                                  Approve Frame
                                </button>
                              )}

                              {vid && (
                                <div className="space-y-1 border-t border-white/[0.07] pt-2">
                                  {vid.status === "COMPLETED" && vid.provider !== "mock" && vid.uri ? (
                                    <>
                                      <video src={vid.uri} controls className="w-full aspect-video rounded bg-zinc-950" />
                                      <button
                                        onClick={() => downloadFromUri(vid.uri!, assetFilename("clip", vid.prompt || shot.generationPrompt))}
                                        className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono uppercase tracking-widest border border-zinc-700 rounded text-zinc-300 hover:bg-zinc-800 transition-colors"
                                      >
                                        <Download size={10} /> Download
                                      </button>
                                    </>
                                  ) : vid.status === "COMPLETED" && vid.provider === "mock" ? (
                                    <div className="relative">
                                      {frame?.uri && <img src={frame.uri} alt="" className="w-full aspect-video object-cover rounded bg-zinc-950 opacity-60" />}
                                      <span className="absolute top-1 left-1 text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-700">
                                        MOCK VIDEO · first-frame preview
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="w-full aspect-video bg-zinc-950 rounded flex items-center justify-center text-red-400 text-xs">video failed</div>
                                  )}
                                  <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500">
                                    <span>{vid.provider}/{vid.model}</span>
                                    <span>${(vid.costUSD ?? 0).toFixed(2)}</span>
                                  </div>
                                  <button onClick={() => retryAsset(vid.id)} className="w-full text-[10px] font-mono uppercase tracking-widest py-1 border border-zinc-700 rounded hover:bg-zinc-800 text-zinc-400">
                                    Retry Video
                                  </button>

                                  {vid.qcStatus && (
                                    <div className={`text-[10px] font-mono px-2 py-1 rounded border ${
                                      vid.qcStatus === "PASSED" ? "text-emerald-400 border-emerald-900 bg-emerald-950/20" : "text-amber-400 border-amber-900 bg-amber-950/20"
                                    }`}>
                                      VIDEO QC · {qcLabel(vid.qcStatus, vid.qcReport?.issues?.length ?? 0)}{vid.qcReport ? ` · ${(vid.qcReport.confidence * 100).toFixed(0)}%` : ""}
                                      {vid.qcReport?.issues?.length ? ` — ${vid.qcReport.issues[0]}` : ""}
                                    </div>
                                  )}
                                  {vid.qcStatus === "NEEDS_REVIEW" && (
                                    <button onClick={() => approveAsset(vid.id)} className="w-full text-[10px] font-mono uppercase tracking-widest py-1 border border-amber-700 rounded hover:bg-amber-900/30 text-amber-400">
                                      Approve Video
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {activeTab === "telemetry" && state.logs && state.logs.length > 0 && (
                <section className="border border-white/[0.07] bg-white/[0.02] p-6 rounded-xl space-y-4">
                   <h3 className="text-xs uppercase tracking-widest text-zinc-500">Execution Observability</h3>
                   <div className="grid grid-cols-3 gap-6 text-sm">
                      <div>
                         <p className="text-[10px] text-zinc-500 uppercase">Total Latency</p>
                         <p className="text-xl font-mono text-zinc-300">{(state.logs.reduce((acc, l) => acc + l.latencyMs, 0) / 1000).toFixed(1)}s</p>
                      </div>
                      <div>
                         <p className="text-[10px] text-zinc-500 uppercase">Total Tokens</p>
                         <p className="text-xl font-mono text-zinc-300">{state.logs.reduce((acc, l) => acc + l.totalTokens, 0).toLocaleString()}</p>
                      </div>
                      <div>
                         <p className="text-[10px] text-zinc-500 uppercase">Agent Calls</p>
                         <p className="text-xl font-mono text-zinc-300">{state.logs.length}</p>
                      </div>
                   </div>
                   <div className="border-t border-white/[0.07] pt-4 mt-4 space-y-1 max-h-32 overflow-y-auto pr-2">
                      {state.logs.map((log, i) => (
                         <div key={i} className="flex justify-between text-[10px] font-mono text-zinc-500">
                            <span className="text-zinc-400">{log.agentName}</span>
                            <span>{log.totalTokens} tokens · {(log.latencyMs / 1000).toFixed(1)}s</span>
                         </div>
                      ))}
                   </div>
                </section>
              )}
              </div>
            </div>
          )}
        </div>
      </div>

      {textKit && (
        <CreativeTextEditor
          imageUri={textKit.imageUri}
          exportWidth={textKit.w}
          exportHeight={textKit.h}
          initialLayers={textKit.layers}
          onSave={saveTextKit}
          onClose={() => setTextKit(null)}
        />
      )}
    </main>
  );
}

function AssetCard({ asset, onRetry, onApprove }: { asset: Asset; onRetry: () => void; onApprove?: () => void }) {
  return (
    <div className="border border-white/[0.07] bg-white/[0.02] rounded-lg overflow-hidden space-y-2 pb-2">
      {asset.uri ? (
        <div className="group relative">
          <img src={asset.uri} alt={asset.prompt} className="w-full aspect-square object-cover bg-zinc-950" />
          <button
            onClick={() => downloadFromUri(asset.uri!, assetFilename("asset", asset.prompt))}
            title="Download"
            className="absolute inset-0 m-auto w-8 h-8 rounded-full bg-zinc-950/80 border border-zinc-700 flex items-center justify-center text-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-zinc-800"
          >
            <Download size={14} />
          </button>
        </div>
      ) : (
        <div className="w-full aspect-square bg-zinc-950 flex items-center justify-center text-xs text-zinc-600">failed</div>
      )}
      <div className="px-2 space-y-1">
        <p className="text-[10px] font-mono text-zinc-400 line-clamp-2">{asset.prompt.slice(0, 60)}</p>
        <div className="flex justify-between text-[10px] font-mono text-zinc-500">
          <span>{asset.provider}/{asset.model}</span>
          <span>${(asset.costUSD ?? 0).toFixed(2)}</span>
        </div>
        {asset.qcStatus && (
          <div className={`text-[10px] font-mono px-2 py-1 rounded border ${
            asset.qcStatus === "PASSED" ? "text-emerald-400 border-emerald-900 bg-emerald-950/20" : "text-amber-400 border-amber-900 bg-amber-950/20"
          }`}>
            QC · {asset.qcStatus}{asset.qcReport ? ` · ${(asset.qcReport.confidence * 100).toFixed(0)}%` : ""}
          </div>
        )}
        {asset.qcStatus === "NEEDS_REVIEW" && onApprove && (
          <button onClick={onApprove} className="w-full text-[10px] font-mono uppercase tracking-widest py-1 border border-amber-700 rounded hover:bg-amber-900/30 text-amber-400">
            Approve
          </button>
        )}
        <button onClick={onRetry} className="w-full text-[10px] font-mono uppercase tracking-widest py-1 border border-zinc-700 rounded hover:bg-zinc-800 text-zinc-400">
          Retry {asset.retryCount ? `(${asset.retryCount})` : ""}
        </button>
      </div>
    </div>
  );
}

function DistField({
  label, value, values, onCopy, copiedKey, k, prefix, joined,
}: {
  label: string;
  value?: string;
  values?: string[];
  onCopy: (key: string, value: string) => void;
  copiedKey: string | null;
  k?: string;
  prefix?: string;
  joined?: boolean;
}) {
  if (value != null) {
    return (
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</span>
          <button
            onClick={() => onCopy(k!, value)}
            className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 uppercase tracking-widest"
          >
            {copiedKey === k ? "✓ copied" : "copy"}
          </button>
        </div>
        <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line bg-zinc-950/50 border border-white/[0.07] rounded p-3 font-mono text-xs">
          {value}
        </p>
      </div>
    );
  }
  if (values && values.length > 0) {
    const copyValue = joined ? values.join(" ") : values.join("\n");
    return (
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</span>
          <button
            onClick={() => onCopy(`${prefix}-all`, copyValue)}
            className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 uppercase tracking-widest"
          >
            {copiedKey === `${prefix}-all` ? "✓ copied" : "copy all"}
          </button>
        </div>
        <div className="space-y-1">
          {values.map((v, i) => (
            <div
              key={i}
              className="flex justify-between items-start gap-3 text-xs bg-zinc-950/50 border border-white/[0.07] rounded p-2 font-mono text-zinc-300"
            >
              <span className="flex-1">{v}</span>
              <button
                onClick={() => onCopy(`${prefix}-${i}`, v)}
                className="text-[10px] text-cyan-400 hover:text-cyan-300 uppercase tracking-widest shrink-0"
              >
                {copiedKey === `${prefix}-${i}` ? "✓" : "copy"}
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
}