import { ImageGenerationProvider, ImageGenerationRequest } from "@/providers/image-provider";
import { VideoGenerationProvider, VideoGenerationRequest } from "@/providers/video-provider";
import { createImageProvider } from "@/providers/image-factory";
import { createVideoProvider } from "@/providers/video-factory";
import { fetchReferenceBytes } from "@/providers/image-storage";
import { ProjectStore } from "@/store/project-store";
import { Asset, CostEntry } from "./asset-schemas";
import { GenerationLineItem, GenerationPlan } from "./generation-schemas";
import { WorldBible, Shot } from "./schemas";
import { Project } from "./project-schemas";
import { BudgetGuard } from "./budget";
import { QCDirector } from "./qc-director";
import { QCStatus } from "./qc-schemas";
import { estimateCredits } from "./credits";
import { spendCredits, grantCredits, getUserCredits } from "@/store/credits-store";

/** Thrown when a batch runs out of credits mid-run; already-completed assets in this run stay charged and saved. */
export class InsufficientCreditsError extends Error {
  constructor(public balance: number, public needed: number) {
    super(`Insufficient credits — need ${needed} more, you have ${balance}.`);
  }
}

const HERO_DIM = { width: 1024, height: 576 };
const NORMAL_DIM = { width: 768, height: 432 };

// Pacing between consecutive generations to stay under per-minute quotas.
const PACING_MS = parseInt(process.env.GEN_PACING_MS ?? "2500", 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class AssetDirector {
  private provider: ImageGenerationProvider;
  private videoProvider: VideoGenerationProvider;
  private qc: QCDirector;

  constructor(
    private store: ProjectStore,
    private uid?: string,
    provider?: ImageGenerationProvider,
    videoProvider?: VideoGenerationProvider,
    qc?: QCDirector
  ) {
    this.provider = provider ?? createImageProvider();
    this.videoProvider = videoProvider ?? createVideoProvider();
    this.qc = qc ?? new QCDirector();
  }

  /**
   * Reserve credits BEFORE calling a paid provider. Throws (stopping the batch) if the balance
   * can't cover the unit.
   *
   * This deliberately runs ahead of the provider call rather than after it. Charging afterwards
   * meant the generation had already happened by the time the debit failed, so an account with
   * no credits still walked away with one finished asset per run — and, because completed assets
   * are skipped on re-invocation, it could collect the whole batch one click at a time. Reserving
   * first makes a shortfall stop the run before any provider spend happens; `refund` returns the
   * credits if the provider then fails to produce anything.
   */
  private async reserve(credits: number): Promise<void> {
    if (!this.uid) return; // no uid bound (e.g. plan-only usage) — nothing to charge
    const r = await spendCredits(this.uid, credits);
    if (!r.ok) throw new InsufficientCreditsError(r.balance, credits);
  }

  /** Return credits reserved for a unit of work that produced nothing. Never throws. */
  private async refund(credits: number): Promise<void> {
    if (!this.uid || credits <= 0) return;
    try {
      await grantCredits(this.uid, credits);
    } catch (e) {
      console.error(`[ASSET DIRECTOR] refund of ${credits} credits failed for uid=${this.uid}:`, e);
    }
  }

  /**
   * Pre-flight affordability check for a whole run, so the UI can refuse up front instead of
   * failing after the first asset. Callers await this before detaching the batch.
   */
  async assertCanAfford(credits: number): Promise<void> {
    if (!this.uid) return;
    const bal = await getUserCredits(this.uid);
    if (bal < credits) throw new InsufficientCreditsError(bal, credits);
  }

  /** Build the plan BEFORE any generation. Pure, no side effects. */
  buildPlan(project: Project, budgetUSD?: number): GenerationPlan {
    if (!project.worldBible || !project.storyboard) {
      throw new Error("Cannot build generation plan: missing WorldBible or Storyboard");
    }
    const wb = project.worldBible;
    const items: GenerationLineItem[] = [];

    for (const c of wb.characters) {
      items.push({
        assetType: "CHARACTER_REF",
        targetId: c.characterId ?? c.name,
        targetName: c.name,
        importance: "HERO",
        estimatedCostUSD: this.provider.estimateCost({ prompt: "", width: HERO_DIM.width, height: HERO_DIM.height }),
        provider: this.provider.name,
        model: this.provider.defaultModel,
      });
    }
    for (const l of wb.locations) {
      items.push({
        assetType: "LOCATION_REF",
        targetId: l.locationId ?? l.name,
        targetName: l.name,
        importance: "NORMAL",
        estimatedCostUSD: this.provider.estimateCost({ prompt: "", width: NORMAL_DIM.width, height: NORMAL_DIM.height }),
        provider: this.provider.name,
        model: this.provider.defaultModel,
      });
    }
    for (const p of wb.props ?? []) {
      items.push({
        assetType: "PROP_REF",
        targetId: p.propId ?? p.name,
        targetName: p.name,
        importance: "NORMAL",
        estimatedCostUSD: this.provider.estimateCost({ prompt: "", width: NORMAL_DIM.width, height: NORMAL_DIM.height }),
        provider: this.provider.name,
        model: this.provider.defaultModel,
      });
    }
    for (const s of project.storyboard.shots) {
      items.push({
        assetType: "FIRST_FRAME",
        targetId: s.shotId,
        targetName: `Shot ${s.shotId} — ${s.scene}`,
        importance: (s.characters.length > 1 || s.scene.toLowerCase().includes("hero")) ? "HERO" : "NORMAL",
        estimatedCostUSD: this.provider.estimateCost({ prompt: "", width: HERO_DIM.width, height: HERO_DIM.height }),
        provider: this.provider.name,
        model: this.provider.defaultModel,
      });
    }

    const estimatedCostUSD = items.reduce((s, i) => s + i.estimatedCostUSD, 0);
    const remainingBudgetUSD = budgetUSD != null ? Math.max(0, budgetUSD - (project.actualCostUSD ?? 0)) : undefined;

    // Phase 4.7: video estimate
    const perClip = this.videoProvider.estimateCost({ prompt: "", durationSeconds: 8, aspectRatio: "16:9" });
    const videoClips = project.storyboard.shots.length;
    const videoEstimatedCostUSD = perClip * videoClips;

    return {
      totalAssets: items.length,
      characterRefs: wb.characters.length,
      locationRefs: wb.locations.length,
      propRefs: (wb.props ?? []).length,
      shotFirstFrames: project.storyboard.shots.length,
      lineItems: items,
      estimatedCostUSD,
      budgetUSD,
      imageProvider: this.provider.name,
      imageModel: this.provider.defaultModel,
      remainingBudgetUSD,
      videoClips,
      videoEstimatedCostUSD,
      videoProvider: this.videoProvider.name,
      videoModel: this.videoProvider.defaultModel,
    };
  }

  /** Persist the plan; no generation yet. */
  async savePlan(projectId: string, plan: GenerationPlan): Promise<Project> {
    const p = await this.store.updateProject(projectId, {
      generationPlan: plan,
      imageProvider: this.provider.name,
      generationStatus: "PLANNED",
    });
    if (!p) throw new Error("Project vanished while saving plan");
    return p;
  }

  /** Execute the image plan — budget checked before EVERY call; Stage A QC per first frame. */
  async executePlan(projectId: string, plan: GenerationPlan, budgetUSD?: number): Promise<Project> {
    let project = await this.store.getProject(projectId);
    if (!project) throw new Error("Project not found");
    if (!project.worldBible || !project.storyboard) throw new Error("Missing WorldBible or Storyboard");

    const guard = new BudgetGuard({
      estimatedUSD: plan.estimatedCostUSD,
      budgetUSD,
    });

    await this.store.updateProject(projectId, { generationStatus: "GENERATING", generationStartedAt: Date.now() });

    const wb = project.worldBible;
    const costLedger: CostEntry[] = [...(project.costLedger ?? [])];

    // Snapshot of assets from BEFORE this run: lets a re-invocation after a partial failure
    // skip anything that already completed, instead of regenerating (and re-paying real
    // provider cost + credits for) work that already succeeded.
    const existingAssets = await this.store.listAssets(projectId);
    const alreadyDone = (assetId: string | undefined): boolean =>
      !!assetId && existingAssets.some((a) => a.id === assetId && a.status === "COMPLETED");

    const tryGenerate = async (
      req: ImageGenerationRequest,
      kind: string,
      assetFn: (img: any) => Omit<Asset, "id" | "projectId" | "createdAt" | "updatedAt">
    ) => {
      const estCost = this.provider.estimateCost(req);
      guard.assertWithin(estCost);

      // Reserved before the provider call, outside the try: an InsufficientCreditsError here must
      // abort the whole batch, not be swallowed by the per-asset failure handler below.
      const unitCredits = estimateCredits("image");
      await this.reserve(unitCredits);

      let asset: Asset;
      try {
        const img = await this.provider.generate(req);
        const base = assetFn(img);
        asset = {
          ...base,
          projectId,
          id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        guard.recordSpend(img.costUSD);
        costLedger.push({
          at: Date.now(),
          kind: "image",
          provider: img.provider,
          model: img.model,
          costUSD: img.costUSD,
          note: `generated ${kind}`,
        });
      } catch (e: any) {
        await this.refund(unitCredits); // nothing was produced — don't bill for it
        const base = assetFn({ uri: "", width: 0, height: 0, provider: this.provider.name, model: this.provider.defaultModel });
        asset = {
          ...base,
          projectId,
          id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          status: "FAILED",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await this.store.saveAsset(asset);
        await this.store.updateProject(projectId, {
          generationStatus: "FAILED_WITH_PARTIAL_ASSETS",
          error: `${kind} failed: ${e?.message ?? e}`,
          costLedger,
        });
        // Keep going. A single asset can fail for reasons that say nothing about the rest of the
        // batch — most commonly the image model declining a prompt (e.g. a character the world
        // bible describes as never physically seen). Re-throwing here used to abort the whole
        // run, so one refusal left every later character, location and shot frame ungenerated.
        // The asset is saved as FAILED and can be retried individually from the gallery.
        //
        // Genuine stop conditions are deliberately left outside this catch and still abort:
        // the budget guard (assertWithin) and credit exhaustion (reserve), both of which run
        // before the try. The reservation for this asset is refunded above, so a refusal costs
        // the user nothing.
        return asset;
      }
      await this.store.saveAsset(asset);
      await this.store.updateProject(projectId, {
        actualCostUSD: guard.spentUSD(),
        costLedger,
      });
      await sleep(PACING_MS);
      return asset;
    };

    try {
    // 1. Character references
    for (const c of wb.characters) {
      if (alreadyDone(c.referenceAssetId)) continue;
      const req: ImageGenerationRequest = {
        prompt: `Character reference sheet for ${c.name}: ${c.appearance}. ${c.personality}. Cinematic, detailed, consistent design.`,
        negativePrompt: "inconsistent, multiple angles, text, watermark",
        width: HERO_DIM.width,
        height: HERO_DIM.height,
        importance: "HERO",
      };
      const asset = await tryGenerate(req, `charref-${c.characterId ?? c.name}`, (img) => ({
        type: "IMAGE",
        provider: img.provider,
        model: img.model,
        prompt: req.prompt,
        uri: img.uri,
        width: req.width,
        height: req.height,
        status: "COMPLETED",
        characterId: c.characterId,
        retryCount: 0,
        seed: img.seed,
        costUSD: img.costUSD,
      }));
      await this.store.updateProject(projectId, {
        worldBible: {
          ...wb,
          characters: wb.characters.map((ch) =>
            ch.characterId === c.characterId ? { ...ch, referenceAssetId: asset.id } : ch
          ),
        },
      });
      project = (await this.store.getProject(projectId))!;
    }

    // 2. Location references
    for (const l of wb.locations) {
      if (alreadyDone(l.referenceAssetId)) continue;
      const req: ImageGenerationRequest = {
        prompt: `Environment plate: ${l.name}. ${l.description ?? ""}. ${wb.visualStyle.artDirection}. ${wb.visualStyle.lighting}. Cinematic wide shot.`,
        negativePrompt: "characters, people, text, watermark",
        width: NORMAL_DIM.width,
        height: NORMAL_DIM.height,
        importance: "NORMAL",
      };
      const asset = await tryGenerate(req, `locref-${l.locationId ?? l.name}`, (img) => ({
        type: "IMAGE",
        provider: img.provider,
        model: img.model,
        prompt: req.prompt,
        uri: img.uri,
        width: req.width,
        height: req.height,
        status: "COMPLETED",
        locationId: l.locationId,
        retryCount: 0,
        seed: img.seed,
        costUSD: img.costUSD,
      }));
      await this.store.updateProject(projectId, {
        worldBible: {
          ...(project.worldBible as WorldBible),
          locations: (project.worldBible as WorldBible).locations.map((lo) =>
            lo.locationId === l.locationId ? { ...lo, referenceAssetId: asset.id } : lo
          ),
        },
      });
      project = (await this.store.getProject(projectId))!;
    }

    // 3. Prop references
    for (const p of wb.props ?? []) {
      if (alreadyDone(p.referenceAssetId)) continue;
      const req: ImageGenerationRequest = {
        prompt: `Prop reference: ${p.name}. ${p.description ?? ""}. Isolated on neutral background, cinematic lighting.`,
        negativePrompt: "characters, text, watermark",
        width: NORMAL_DIM.width,
        height: NORMAL_DIM.height,
      };
      const asset = await tryGenerate(req, `propref-${p.propId ?? p.name}`, (img) => ({
        type: "IMAGE",
        provider: img.provider,
        model: img.model,
        prompt: req.prompt,
        uri: img.uri,
        width: req.width,
        height: req.height,
        status: "COMPLETED",
        retryCount: 0,
        seed: img.seed,
        costUSD: img.costUSD,
      }));
      await this.store.updateProject(projectId, {
        worldBible: {
          ...(project.worldBible as WorldBible),
          props: ((project.worldBible as WorldBible).props ?? []).map((pr) =>
            pr.propId === p.propId ? { ...pr, referenceAssetId: asset.id } : pr
          ),
        },
      });
      project = (await this.store.getProject(projectId))!;
    }

    // 4. First frames per shot (with real reference URIs) + STAGE A QC
    const wbCurrent = (await this.store.getProject(projectId))!.worldBible as WorldBible;
    const allAssets = await this.store.listAssets(projectId);

    const toFetchable = (u: string): string =>
      u.startsWith("/api/") ? `http://localhost:3000${u}` : u;

    for (const shot of project.storyboard!.shots) {
      if (alreadyDone(shot.firstFrameAssetId)) continue;
      const characterRefs = (shot.characterIds ?? [])
        .map((cid) => wbCurrent.characters.find((c) => c.characterId === cid))
        .filter(Boolean)
        .map((c) => `Character ${c!.name}: ${c!.appearance}`)
        .join(". ");
      const loc = wbCurrent.locations.find((l) => l.locationId === shot.locationId);
      const locText = loc ? `Location ${loc.name}: ${loc.description ?? ""}` : `Location ${shot.location}`;

      const refAssetIds = [
        ...(shot.characterIds ?? [])
          .map((cid) => wbCurrent.characters.find((c) => c.characterId === cid)?.referenceAssetId)
          .filter(Boolean),
        loc?.referenceAssetId,
      ].filter((id): id is string => !!id);

      const refUris = refAssetIds
        .map((id) => allAssets.find((a) => a.id === id)?.uri)
        .filter((u): u is string => !!u && (u.startsWith("http") || u.startsWith("data:") || u.startsWith("/api/")))
        .map(toFetchable);

      const prompt = `${shot.generationPrompt}. ${characterRefs}. ${locText}. Visual style: ${wbCurrent.visualStyle.artDirection}. ${wbCurrent.visualStyle.lighting}. Continuity: ${shot.continuityRequirements.join("; ")}.`;

      const req: ImageGenerationRequest = {
        prompt,
        negativePrompt: "inconsistent, text, watermark, extra characters",
        width: HERO_DIM.width,
        height: HERO_DIM.height,
        importance: (shot.characters.length > 1) ? "HERO" : "NORMAL",
        references: refUris,
      };

      const asset = await tryGenerate(req, `frame-${shot.shotId}`, (img) => ({
        type: "IMAGE",
        provider: img.provider,
        model: img.model,
        prompt: req.prompt,
        uri: img.uri,
        width: req.width,
        height: req.height,
        status: "COMPLETED",
        shotId: shot.shotId,
        characterIds: shot.characterIds,
        locationId: shot.locationId,
        parentAssetIds: refAssetIds,
        retryCount: 0,
        seed: img.seed,
        costUSD: img.costUSD,
      }));

      await this.store.updateProject(projectId, {
        storyboard: {
          shots: (project.storyboard as any).shots.map((s: Shot) =>
            s.shotId === shot.shotId ? { ...s, firstFrameAssetId: asset.id } : s
          ),
        },
      });

      // STAGE A QC: cheap VLM gate before expensive video
      const qcOutcome = await this.qc.evaluateFirstFrame(shot, asset, wbCurrent);
      let qcReport = qcOutcome.report;
      let qcStatus: QCStatus = qcOutcome.status === "FAILED" ? "NEEDS_REVIEW" : qcOutcome.status;
      let frameUri = asset.uri;

      if (qcOutcome.recommendation === "RETRY") {
        try {
          const retryImg = await this.provider.generate({ ...req, seed: (asset.seed ?? 1) + 1 });
          frameUri = retryImg.uri;
          guard.recordSpend(retryImg.costUSD);
          costLedger.push({ at: Date.now(), kind: "image", provider: retryImg.provider, model: retryImg.model, costUSD: retryImg.costUSD, note: `qc-retry frame ${shot.shotId}` });
          const reQC = await this.qc.evaluateFirstFrame(shot, { ...asset, uri: frameUri }, wbCurrent);
          qcReport = reQC.report;
          qcStatus = reQC.recommendation === "PASS" ? "PASSED" : "NEEDS_REVIEW";
        } catch {
          qcStatus = "NEEDS_REVIEW";
        }
      }

      guard.recordSpend(qcOutcome.costUSD);
      costLedger.push({ at: Date.now(), kind: "vlm", provider: "vertex-vlm", costUSD: qcOutcome.costUSD, note: `qc frame ${shot.shotId}` });
      await this.store.saveAsset({ ...asset, uri: frameUri, qcReport, qcStatus, updatedAt: Date.now() });
      await this.store.updateProject(projectId, { actualCostUSD: guard.spentUSD(), costLedger });

      project = (await this.store.getProject(projectId))!;
    }
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        const stopped = await this.store.updateProject(projectId, {
          generationStatus: "FAILED_WITH_PARTIAL_ASSETS",
          error: `Stopped: ${e.message}`,
        });
        return stopped!;
      }
      throw e; // other errors: tryGenerate already recorded a FAILED asset + project error
    }

    const finalProject = await this.store.updateProject(projectId, {
      generationStatus: "COMPLETED",
      actualCostUSD: guard.spentUSD(),
    });
    return finalProject!;
  }

  /** Phase 4.7: image-to-video per shot. Budget-checked; Stage B QC per clip; human gate on NEEDS_REVIEW frames. */
  async generateVideos(projectId: string, budgetUSD?: number): Promise<Project> {
    let project = await this.store.getProject(projectId);
    if (!project?.storyboard || !project.worldBible) throw new Error("Missing storyboard or worldBible");

    const shots = project.storyboard.shots;
    const wbCurrent = project.worldBible as WorldBible;
    const perClip = this.videoProvider.estimateCost({ prompt: "", durationSeconds: 8, aspectRatio: "16:9" });
    const guard = new BudgetGuard({ estimatedUSD: perClip * shots.length, budgetUSD });
    let ledger: CostEntry[] = [...(project.costLedger ?? [])];

    await this.store.updateProject(projectId, { videoGenerationStatus: "GENERATING", videoGenerationStartedAt: Date.now() });

    let allOk = true;
    let rendered = 0;
    let blockedByReview = 0;   // shots whose first frame is waiting on a human decision
    let missingFrame = 0;      // shots with no usable first frame at all
    for (const shot of shots) {
      const assets = await this.store.listAssets(projectId);

      const done = assets.find((a) => a.shotId === shot.shotId && a.type === "VIDEO" && a.status === "COMPLETED");
      if (done) continue; // never regenerate a successful video

      const firstFrame =
        assets.find((a) => a.id === shot.firstFrameAssetId) ??
        assets.find((a) => a.shotId === shot.shotId && a.type === "IMAGE" && a.status === "COMPLETED");

      if (!firstFrame?.uri) {
        missingFrame++;
        allOk = false;
        await this.store.saveAsset({
          id: `vid-${shot.shotId}-${Date.now()}`, projectId, shotId: shot.shotId, type: "VIDEO",
          provider: this.videoProvider.name, model: this.videoProvider.defaultModel,
          prompt: shot.generationPrompt, status: "FAILED", retryCount: 0,
          createdAt: Date.now(), updatedAt: Date.now(),
        });
        continue;
      }

      // Human gate: never spend video money on a frame flagged NEEDS_REVIEW / FAILED.
      // Counted, not just skipped — when this gate blocks every shot the run finishes having done
      // nothing, and silently returning "complete" left the user clicking Generate Videos with no
      // clip, no charge and no explanation anywhere on the page.
      if (firstFrame.qcStatus === "NEEDS_REVIEW" || firstFrame.qcStatus === "FAILED") {
        blockedByReview++;
        allOk = false;
        continue;
      }

      const fetchable = firstFrame.uri.startsWith("/api/") ? `http://localhost:3000${firstFrame.uri}` : firstFrame.uri;
      const buf = await fetchReferenceBytes(fetchable);
      if (!buf) { missingFrame++; allOk = false; continue; }

      const req: VideoGenerationRequest = {
        prompt: `${shot.generationPrompt} Continuity: ${shot.continuityRequirements.join("; ")}.`,
        firstFrameBytes: buf.toString("base64"),
        firstFrameMime: "image/png",
        durationSeconds: parseInt(shot.duration) || 8,
        aspectRatio: "16:9",
        importance: (shot.characterIds?.length ?? 0) > 1 ? "HERO" : "NORMAL",
      };

      // Reserved before the render, outside the try — a Veo clip is the single most expensive
      // unit in the product, so an unaffordable run must stop before the provider is called.
      const clipCredits = estimateCredits("videoPerSecond", req.durationSeconds);
      try {
        await this.reserve(clipCredits);
      } catch (e: any) {
        if (e instanceof InsufficientCreditsError) {
          // Clips already rendered in this run stay saved and paid for; the batch just stops here.
          return (await this.store.updateProject(projectId, {
            videoGenerationStatus: "FAILED_WITH_PARTIAL_ASSETS",
            costLedger: ledger,
            error: `Stopped: ${e.message}`,
          }))!;
        }
        throw e;
      }

      try {
        guard.assertWithin(this.videoProvider.estimateCost(req)); // BEFORE the call, always
        const vid = await this.videoProvider.generate(req);
        guard.recordSpend(vid.costUSD);
        ledger.push({ at: Date.now(), kind: "video", provider: vid.provider, model: vid.model, costUSD: vid.costUSD, note: `shot ${shot.shotId}` });

        const asset: Asset = {
          id: `vid-${shot.shotId}-${Date.now()}`, projectId, shotId: shot.shotId, type: "VIDEO",
          provider: vid.provider, model: vid.model, prompt: req.prompt, uri: vid.uri,
          status: "COMPLETED", parentAssetIds: [firstFrame.id], retryCount: 0,
          costUSD: vid.costUSD, createdAt: Date.now(), updatedAt: Date.now(),
        };
        await this.store.saveAsset(asset);
        await this.store.updateProject(projectId, {
          actualCostUSD: (project.actualCostUSD ?? 0) + vid.costUSD,
          costLedger: ledger,
          storyboard: { shots: shots.map((s) => (s.shotId === shot.shotId ? { ...s, videoAssetId: asset.id } : s)) },
        });
        // STAGE B QC on the rendered clip
        const qcB = await this.qc.evaluateVideo(shot, asset, firstFrame, wbCurrent);
        const videoQcStatus: QCStatus = qcB.status === "FAILED" ? "NEEDS_REVIEW" : qcB.status;
        guard.recordSpend(qcB.costUSD);
        ledger.push({ at: Date.now(), kind: "vlm", provider: "vertex-vlm", costUSD: qcB.costUSD, note: `qc video ${shot.shotId}` });
        await this.store.saveAsset({ ...asset, qcReport: qcB.report, qcStatus: videoQcStatus, updatedAt: Date.now() });
        await this.store.updateProject(projectId, { actualCostUSD: guard.spentUSD() + (project.actualCostUSD ?? 0), costLedger: ledger });

        rendered++;
        project = (await this.store.getProject(projectId))!;
      } catch (e: any) {
        await this.refund(clipCredits); // the render never landed — don't bill for it
        allOk = false;
        console.error(`[ASSET DIRECTOR] video failed for shot ${shot.shotId}:`, e?.message ?? e);
        await this.store.saveAsset({
          id: `vid-${shot.shotId}-${Date.now()}`, projectId, shotId: shot.shotId, type: "VIDEO",
          provider: this.videoProvider.name, model: this.videoProvider.defaultModel,
          prompt: req.prompt, status: "FAILED", retryCount: 0,
          createdAt: Date.now(), updatedAt: Date.now(),
        });
        await this.store.updateProject(projectId, { costLedger: ledger, error: `video shot ${shot.shotId}: ${e?.message ?? e}` });
      }

      await sleep(PACING_MS);
    }

    // Say why nothing happened. A run that renders no clips because every first frame is awaiting
    // approval is not a failure of the renderer, and the user needs to know which it was.
    let reason: string | undefined;
    if (rendered === 0 && blockedByReview > 0) {
      reason = `No clips rendered: ${blockedByReview} shot${blockedByReview === 1 ? "" : "s"} ` +
        `${blockedByReview === 1 ? "is" : "are"} waiting on first-frame approval. Approve or retry ` +
        `${blockedByReview === 1 ? "that frame" : "those frames"} in the asset gallery, then run videos again.`;
    } else if (rendered === 0 && missingFrame > 0) {
      reason = `No clips rendered: ${missingFrame} shot${missingFrame === 1 ? "" : "s"} ` +
        `${missingFrame === 1 ? "has" : "have"} no usable first frame. Generate assets first.`;
    } else if (blockedByReview > 0) {
      reason = `${rendered} clip${rendered === 1 ? "" : "s"} rendered; ${blockedByReview} skipped ` +
        `pending first-frame approval.`;
    }

    const final = await this.store.updateProject(projectId, {
      videoGenerationStatus: allOk ? "COMPLETED" : "FAILED_WITH_PARTIAL_ASSETS",
      costLedger: ledger,
      ...(reason ? { error: reason } : {}),
    });
    return final!;
  }

  /** Retry a single asset by id (image or video). */
  async retryAsset(projectId: string, assetId: string, budgetUSD?: number): Promise<Asset> {
    const project = await this.store.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const assets = await this.store.listAssets(projectId);
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) throw new Error("Asset not found");

    // Retries are gated only by the user's hard budget (no plan estimate applies).
    const guard = new BudgetGuard(budgetUSD != null ? { budgetUSD } : {});
    guard.recordSpend(project.actualCostUSD ?? 0);

    // A retry is a fresh paid generation, so it is reserved like any other. The image branch
    // previously charged nothing at all, which made the gallery's retry button an unlimited
    // source of free images for any account.
    const retryCredits =
      asset.type === "VIDEO" ? estimateCredits("videoPerSecond", 8) : estimateCredits("image");
    await this.reserve(retryCredits);

    try {
      // VIDEO retry path
      if (asset.type === "VIDEO") {
        const est = this.videoProvider.estimateCost({ prompt: asset.prompt, durationSeconds: 8, aspectRatio: "16:9" });
        guard.assertWithin(est);
        const all = await this.store.listAssets(projectId);
        const frame = all.find((a) => a.id === (asset.parentAssetIds ?? [])[0]);
        const fetchable = frame?.uri?.startsWith("/api/") ? `http://localhost:3000${frame.uri}` : frame?.uri;
        const buf = fetchable ? await fetchReferenceBytes(fetchable) : null;
        const vid = await this.videoProvider.generate({
          prompt: asset.prompt,
          firstFrameBytes: buf?.toString("base64"),
          durationSeconds: 8,
          aspectRatio: "16:9",
        });
        const updated: Asset = {
          ...asset, uri: vid.uri, status: "COMPLETED", provider: vid.provider, model: vid.model,
          retryCount: (asset.retryCount ?? 0) + 1, costUSD: (asset.costUSD ?? 0) + vid.costUSD, updatedAt: Date.now(),
        };
        await this.store.saveAsset(updated);
        const costLedger = [...(project.costLedger ?? [])];
        costLedger.push({ at: Date.now(), kind: "video", provider: vid.provider, model: vid.model, costUSD: vid.costUSD, note: `retry ${assetId}` });
        await this.store.updateProject(projectId, { actualCostUSD: (project.actualCostUSD ?? 0) + vid.costUSD, costLedger });
        const after = await this.store.listAssets(projectId);
        if (!after.some((a) => a.type === "VIDEO" && a.status === "FAILED")) {
          await this.store.updateProject(projectId, { videoGenerationStatus: "COMPLETED" });
        }
        return updated;
      }

      // IMAGE retry path — reuse the asset's original dimensions rather than a hardcoded size,
      // so a retried hero shot/character doesn't come back at the wrong aspect ratio.
      const width = asset.width || 768;
      const height = asset.height || 432;
      const estCost = this.provider.estimateCost({ prompt: asset.prompt, width, height });
      guard.assertWithin(estCost);

      const img = await this.provider.generate({
        prompt: asset.prompt,
        width,
        height,
        seed: (asset.seed ?? 0) + 1,
      });
      const updated: Asset = {
        ...asset,
        uri: img.uri,
        status: "COMPLETED",
        provider: img.provider,
        model: img.model,
        seed: img.seed,
        retryCount: (asset.retryCount ?? 0) + 1,
        costUSD: (asset.costUSD ?? 0) + img.costUSD,
        updatedAt: Date.now(),
      };
      await this.store.saveAsset(updated);

      const costLedger = [...(project.costLedger ?? [])];
      costLedger.push({
        at: Date.now(),
        kind: "image",
        provider: img.provider,
        model: img.model,
        costUSD: img.costUSD,
        note: `retry ${assetId}`,
      });
      await this.store.updateProject(projectId, {
        actualCostUSD: (project.actualCostUSD ?? 0) + img.costUSD,
        costLedger,
      });

      const after = await this.store.listAssets(projectId);
      if (!after.some((a) => a.type === "IMAGE" && a.status === "FAILED")) {
        await this.store.updateProject(projectId, { generationStatus: "COMPLETED" });
      }
      return updated;
    } catch (e: any) {
      await this.refund(retryCredits); // the retry produced nothing — don't bill for it
      await this.store.saveAsset({ ...asset, status: "FAILED", updatedAt: Date.now() });
      throw e;
    }
  }
}