"use server";

import { createServerProjectStore } from "@/store/server-factory";
import { AssetDirector } from "@/core/asset-director";
import { QCDirector } from "@/core/qc-director";
import { GenerationPlan } from "@/core/generation-schemas";
import { imageProviderMode } from "@/providers/image-factory";
import { videoProviderMode } from "@/providers/video-factory";
import { vlmProviderMode } from "@/providers/vlm-factory";
import { Assembler } from "@/core/assembler";
import { storeVideo, storeImage } from "@/providers/image-storage";
import { Asset } from "@/core/asset-schemas";
import { createDistributionProvider, distributionProviderMode } from "@/providers/distribution-factory";
import { CreativeDirector } from "@/core/creative-director";
import { createAudioProvider, audioProviderMode } from "@/providers/audio-factory";
import { verifyUser, spendCredits } from "@/store/credits-store";
import { estimateCredits } from "@/core/credits";
import { requireProjectOwner } from "@/app/actions/project-auth";

export async function serverBuildGenerationPlan(idToken: string, projectId: string, budgetUSD?: number): Promise<GenerationPlan> {
  const { store, project } = await requireProjectOwner(idToken, projectId);
  const director = new AssetDirector(store);
  const plan = director.buildPlan(project, budgetUSD);
  await director.savePlan(projectId, plan);
  return plan;
}

export async function serverApproveAndGenerate(idToken: string, projectId: string, budgetUSD?: number): Promise<void> {
  const { uid, store, project } = await requireProjectOwner(idToken, projectId);
  if (!project.generationPlan) throw new Error("No plan to execute");
  const director = new AssetDirector(store, uid);
  const fresh = director.buildPlan(project, budgetUSD);
  // Pre-flight: executePlan is detached below, so a credit failure inside it can only be logged.
  // Check affordability here, while we can still surface the error to the user.
  await director.assertCanAfford(estimateCredits("image"));
  await director.savePlan(projectId, fresh);
  void director.executePlan(projectId, fresh, budgetUSD).catch((e) =>
    console.error("[ASSET DIRECTOR] detached execution failed:", e)
  );
}

export async function serverRetryAsset(idToken: string, projectId: string, assetId: string, budgetUSD?: number): Promise<void> {
  const { uid, store } = await requireProjectOwner(idToken, projectId);
  const director = new AssetDirector(store, uid);
  await director.retryAsset(projectId, assetId, budgetUSD);
}

const STUCK_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * If a generation run crashed mid-batch (server restart, uncaught error before status update),
 * the project is left at "GENERATING" forever with no way forward. This clears it back to a
 * resumable state so the user can hit "Generate" again — the dedup checks in AssetDirector
 * (skip-if-already-completed) make that safe rather than duplicating finished work.
 */
export async function serverResetStuckGeneration(idToken: string, projectId: string, which: "images" | "videos"): Promise<void> {
  const { store, project } = await requireProjectOwner(idToken, projectId);
  const startedAt = which === "images" ? project.generationStartedAt : project.videoGenerationStartedAt;
  const status = which === "images" ? project.generationStatus : project.videoGenerationStatus;
  if (status !== "GENERATING" || !startedAt || Date.now() - startedAt < STUCK_THRESHOLD_MS) {
    throw new Error("This run isn't stuck yet.");
  }
  if (which === "images") {
    await store.updateProject(projectId, { generationStatus: "PLANNED" });
  } else {
    await store.updateProject(projectId, { videoGenerationStatus: undefined });
  }
}

export async function serverGetImageMode(): Promise<"GEMINI" | "VERTEX" | "POLLINATIONS" | "MOCK"> {
  return imageProviderMode();
}

export async function serverGenerateVideos(idToken: string, projectId: string, budgetUSD?: number): Promise<void> {
  const { uid, store } = await requireProjectOwner(idToken, projectId);
  const director = new AssetDirector(store, uid);
  // Same pre-flight as the image run — a Veo clip is the priciest unit in the product, so an
  // account that can't cover one should be told before the run detaches.
  await director.assertCanAfford(estimateCredits("videoPerSecond", 5));
  void director.generateVideos(projectId, budgetUSD).catch((e) =>
    console.error("[ASSET DIRECTOR] video run failed:", e)
  );
}

export async function serverGetVideoMode(): Promise<string> {
  return videoProviderMode();
}

export async function serverGetVLMMode(): Promise<string> {
  return vlmProviderMode();
}

/** Standalone QC over existing assets — test Phase 5 with zero new generation. */
export async function serverQCProject(idToken: string, projectId: string, force = false): Promise<void> {
  const { store, project } = await requireProjectOwner(idToken, projectId);
  const qc = new QCDirector();
  if (!project?.storyboard || !project.worldBible) return;
  const wb = project.worldBible;
  const assets = await store.listAssets(projectId);

  // Reference QC: character sheets + environment plates
  for (const a of assets) {
    if (a.type !== "IMAGE" || a.shotId) continue;
    if (!force && a.qcStatus != null) continue;
    const char = wb.characters.find((c) => c.characterId === a.characterId);
    const loc = wb.locations.find((l) => l.locationId === a.locationId);
    if (!char && !loc) continue;
    const description = char
      ? `${char.name}: ${char.appearance}. ${char.personality}`
      : `${loc!.name}: ${loc!.description ?? ""}`;
    const kind = char ? "character reference sheet" : "environment plate";
    const out = await qc.evaluateReference(a, description, kind);
    await store.saveAsset({ ...a, qcReport: out.report, qcStatus: out.status === "FAILED" ? "NEEDS_REVIEW" : out.status, updatedAt: Date.now() });
  }

  // Shot QC: first frames + videos
  for (const shot of project.storyboard.shots) {
    const frame =
      assets.find((a) => a.id === shot.firstFrameAssetId) ??
      assets.find((a) => a.shotId === shot.shotId && a.type === "IMAGE" && a.status === "COMPLETED");
    if (frame && (force || frame.qcStatus == null)) {
      const out = await qc.evaluateFirstFrame(shot, frame, wb);
      await store.saveAsset({ ...frame, qcReport: out.report, qcStatus: out.status === "FAILED" ? "NEEDS_REVIEW" : out.status, updatedAt: Date.now() });
    }
    const vid = assets.find((a) => a.shotId === shot.shotId && a.type === "VIDEO" && a.status === "COMPLETED");
    if (vid && (force || vid.qcStatus == null)) {
      const out = await qc.evaluateVideo(shot, vid, frame, wb);
      await store.saveAsset({ ...vid, qcReport: out.report, qcStatus: out.status === "FAILED" ? "NEEDS_REVIEW" : out.status, updatedAt: Date.now() });
    }
  }
}

/** Human approval gate for NEEDS_REVIEW assets. */
export async function serverApproveAsset(idToken: string, projectId: string, assetId: string): Promise<void> {
  const { store } = await requireProjectOwner(idToken, projectId);
  const assets = await store.listAssets(projectId);
  const asset = assets.find((a) => a.id === assetId);
  if (!asset) return;
  await store.saveAsset({ ...asset, qcStatus: "PASSED", updatedAt: Date.now() });
}

export async function serverAssembleFilm(idToken: string, projectId: string): Promise<void> {
  const { store, project } = await requireProjectOwner(idToken, projectId);
  if (!project?.storyboard) throw new Error("Missing storyboard");

  const assets = await store.listAssets(projectId);
  const videos = assets.filter((a) => a.type === "VIDEO" && a.status === "COMPLETED" && a.shotId);

  const assembler = new Assembler();
  const result = await assembler.assembleFilm(project, videos);

  const uri = await storeVideo(result.bytes);
  const filmAsset: Asset = {
    id: `film-${Date.now()}`,
    projectId,
    type: "VIDEO",
    provider: "ffmpeg",
    model: "assembly",
    prompt: `Final film: ${project.title} (${result.shotBreakdown.map((b) => `${b.shotId}:${b.trimmedTo}s`).join(" + ")})`,
    uri,
    status: "COMPLETED",
    parentAssetIds: videos.map((v) => v.id),
    retryCount: 0,
    costUSD: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await store.saveAsset(filmAsset);

  const ledger = [...(project.costLedger ?? [])];
  ledger.push({ at: Date.now(), kind: "assembly", provider: "ffmpeg", model: "assembly", costUSD: 0, note: `final film ${result.durationSeconds}s` });
  await store.updateProject(projectId, { finalFilmAssetId: filmAsset.id, costLedger: ledger });
}

export async function serverGetDistributionMode(): Promise<string> {
  return distributionProviderMode();
}

export async function serverGenerateDistribution(idToken: string, projectId: string): Promise<void> {
  const { store } = await requireProjectOwner(idToken, projectId);
  await store.updateProject(projectId, { distributionStatus: "GENERATING" });
  try {
    const project = await store.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const provider = createDistributionProvider();
    const pkg = await provider.generateDistributionPackage(project);
    await store.updateProject(projectId, {
      distributionPackage: pkg,
      distributionStatus: "COMPLETED",
    });
  } catch (e: any) {
    console.error("[DISTRIBUTION] generation failed:", e?.message ?? e);
    await store.updateProject(projectId, { distributionStatus: "FAILED" });
  }
}

/** Phase 6B: platform-native creatives (thumbnail / cover / pin / ...) from distribution concepts. */
export async function serverGenerateCreatives(idToken: string, projectId: string, budgetUSD?: number, force = false): Promise<void> {
  const { uid, store } = await requireProjectOwner(idToken, projectId);
  const director = new CreativeDirector(store, uid);
  await director.generateCreatives(projectId, budgetUSD, force);
}

export async function serverGetAudioMode(): Promise<string> {
  return audioProviderMode();
}

/** Phase 5C: synthesize the package's narrationScript with Gemini TTS (or mock). Flat 2-credit charge. */
export async function serverGenerateVoiceover(idToken: string, projectId: string): Promise<void> {
  const { uid, store, project } = await requireProjectOwner(idToken, projectId);
  if (!project?.distributionPackage) throw new Error("Generate the distribution package first");
  const text = project.distributionPackage.generic.narrationScript;
  if (!text) throw new Error("Package has no narrationScript — regenerate the package");

  const cr = estimateCredits("tts");
  const settle = await spendCredits(uid, cr);
  if (!settle.ok) throw new Error(`Insufficient credits — need ${cr}, you have ${settle.balance}.`);

  const provider = createAudioProvider();

  const filmSeconds =
    project.storyboard?.shots.reduce((s, sh) => s + (parseFloat(sh.duration) || 0), 0) || undefined;

  const audio = await provider.synthesizeSpeech({
    text,
    styleHint: "Warm cinematic narrator, natural pace",
    maxSeconds: filmSeconds,
  });

  const asset: Asset = {
    id: `vo-${Date.now()}`,
    projectId,
    type: "VOICE",
    provider: audio.provider,
    model: audio.model,
    prompt: text,
    uri: audio.uri,
    status: "COMPLETED",
    retryCount: 0,
    costUSD: audio.costUSD,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await store.saveAsset(asset);
  await store.updateProject(projectId, { voiceoverAssetId: asset.id });
}

/** Phase 5C: blend native film audio + voiceover into a new final film asset. */
export async function serverMixAudio(idToken: string, projectId: string): Promise<void> {
  const { store, project } = await requireProjectOwner(idToken, projectId);
  if (!project?.voiceoverAssetId) throw new Error("Need a voiceover first");

  const assets = await store.listAssets(projectId);
  // Always mix from the pristine base film (never from a previous mix)
  const baseId =
    project.baseFilmAssetId ??
    assets.find((a) => a.model === "assembly")?.id ??
    project.finalFilmAssetId;
  const base = assets.find((a) => a.id === baseId);
  const vo = assets.find((a) => a.id === project.voiceoverAssetId);
  if (!base?.uri || !vo?.uri) throw new Error("Missing URIs");

  const assembler = new Assembler();
  const mixed = await assembler.mixVoiceover(base.uri, vo.uri);
  const uri = await storeVideo(mixed);

  const mixedAsset: Asset = {
    id: `film-mixed-${Date.now()}`, projectId, type: "VIDEO",
    provider: "ffmpeg", model: "assembly+vo",
    prompt: `Final film with narration: ${project.title}`,
    uri, status: "COMPLETED", parentAssetIds: [base.id, vo.id],
    retryCount: 0, costUSD: 0, createdAt: Date.now(), updatedAt: Date.now(),
  };
  await store.saveAsset(mixedAsset);
  await store.updateProject(projectId, { finalFilmAssetId: mixedAsset.id, baseFilmAssetId: base.id });
}

/** TextKit: save an exported titled creative PNG back into the package (layers stay re-editable). */
export async function serverSaveTextCreative(
  idToken: string,
  projectId: string,
  platform: "youtube" | "instagram" | "pinterest" | "tiktok" | "x" | "linkedin" | "facebook",
  dataUrl: string,
  layers: unknown
): Promise<void> {
  const { store, project } = await requireProjectOwner(idToken, projectId);
  if (!project?.distributionPackage) throw new Error("No distribution package");

  const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
  const uri = await storeImage(bytes, "image/png");

  const pkg: any = JSON.parse(JSON.stringify(project.distributionPackage));
  const field =
    platform === "youtube" ? "thumbnailImageUri" :
    platform === "instagram" ? "coverImageUri" :
    platform === "pinterest" ? "pinImageUri" :
    platform === "tiktok" ? "coverImageUri" :
    "postImageUri";
  pkg[platform][field] = uri;
  pkg.textOverlays = { ...(pkg.textOverlays ?? {}), [platform]: layers };
  await store.updateProject(projectId, { distributionPackage: pkg });
}

/** Archive restore: rebuilds Scrap & Spark's project doc + video/film assets from on-disk files. Idempotent. */
export async function serverRestoreScrapAndSpark(): Promise<string> {
  const store = createServerProjectStore();
  const id = "mA4iXA9lzEA1k2W5eMaK"; // known from server logs
  const existing = await store.getProject(id);
  if (existing) return "Project already exists; nothing restored.";
  const now = Date.now();

  const wb: any = {
    title: "Scrap & Spark",
    premise: "A determined wind-up robot, Cogsworth, navigates a desolate junkyard, its journey culminating in the wondrous discovery of a single, magically glowing flower — unexpected beauty and hope amidst decay.",
    visualStyle: {
      artDirection: "Highly detailed cinematic animation; a blend of industrial grime and delicate natural beauty.",
      lighting: "Moody, high-contrast chiaroscuro; the Luminous Bloom is the sole magical light source.",
    },
    characters: [{
      characterId: "cogsworth", name: "Cogsworth", role: "Protagonist",
      appearance: "A small, cube-like wind-up robot of worn brass and rusted steel; expressive optical sensors; wind-up key on its back",
      personality: "Brave, persistent, wonder-filled",
    }],
    locations: [
      { locationId: "junkyard_labyrinth", name: "The Junkyard Labyrinth", description: "A vast, decaying expanse of rusted metal and forgotten machinery" },
      { locationId: "hidden_nook", name: "The Hidden Nook", description: "A small, sheltered space within the junkyard where the luminous bloom grows" },
    ],
    props: [{ propId: "luminous_bloom", name: "Luminous Bloom", description: "A single magically glowing flower; luminescence must stay consistent" }],
  };

  const shots: any[] = [
    {
      shotId: "cogsworth_journey_001", scene: "The Junkyard Labyrinth", duration: "2.5s",
      action: "Cogsworth, a small wind-up robot, determinedly walks/clambers over a small mound of rusted scrap metal.",
      camera: "wide tracking", lighting: "dim ambient, warm rust highlights",
      characterIds: ["cogsworth"], locationId: "junkyard_labyrinth",
      continuityRequirements: ["wind-up key stays on the back", "consistent brass/rust materials"],
      generationPrompt: "Cogsworth, a small wind-up robot, determinedly walks/clambers over a small mound of rusted scrap metal in a vast decaying junkyard, cinematic animation, moody chiaroscuro lighting",
      videoAssetId: "restored-video-001",
    },
    {
      shotId: "cogsworth_discovery_002", scene: "The Hidden Nook", duration: "2.5s",
      action: "Cogsworth tentatively steps into a confined, shadowed nook. Its optical sensors widen slightly as it discovers the luminous bloom.",
      camera: "close push-in", lighting: "bloom as primary light",
      characterIds: ["cogsworth"], locationId: "hidden_nook",
      continuityRequirements: ["bloom luminescence consistent", "wind-up key on back"],
      generationPrompt: "Cogsworth tentatively steps into a confined shadowed nook and discovers a single magically glowing flower, cinematic animation, the flower is the sole magical light source",
      videoAssetId: "restored-video-002",
    },
  ];

  await store.updateProject(id, {
    id,
    title: "Scrap & Spark",
    status: "COMPLETED",
    requestedDuration: 5,
    createdAt: now,
    updatedAt: now,
    actualCostUSD: 6.67,
    costLedger: [],
    logs: [],
    generationStatus: "COMPLETED",
    videoGenerationStatus: "COMPLETED",
    finalFilmAssetId: "restored-film",
    worldBible: wb,
    storyboard: { shots },
  } as any);

  const assets: any[] = [
    { id: "restored-film", projectId: id, type: "VIDEO", provider: "ffmpeg", model: "assembly",
      prompt: "Final film: Scrap & Spark (cogsworth_journey_001:2.5s + cogsworth_discovery_002:2.5s)",
      uri: "/api/assets/videos/vid-1787150442310-y51dki", status: "COMPLETED", retryCount: 0, costUSD: 0, createdAt: now, updatedAt: now },
    { id: "restored-video-001", projectId: id, type: "VIDEO", provider: "veo", model: "veo-3.1-generate-001",
      prompt: shots[0].generationPrompt, uri: "/api/assets/videos/vid-1787126206661-tf3lud",
      status: "COMPLETED", shotId: "cogsworth_journey_001", qcStatus: "PASSED", retryCount: 0, costUSD: 3.2, createdAt: now, updatedAt: now },
    { id: "restored-video-002", projectId: id, type: "VIDEO", provider: "veo", model: "veo-3.1-generate-001",
      prompt: shots[1].generationPrompt, uri: "/api/assets/videos/vid-1787126336835-77rckd",
      status: "COMPLETED", shotId: "cogsworth_discovery_002", qcStatus: "PASSED", retryCount: 0, costUSD: 3.2, createdAt: now, updatedAt: now },
  ];
  for (const a of assets) await store.saveAsset(a);
  return "Restored Scrap & Spark (project + 3 assets).";
}

/**
 * Bind a production to the signed-in user. Verified server-side from the token — never trusts a
 * client-supplied uid — and refuses to steal a project someone else already owns. In the normal
 * flow this is now a no-op (startProduction sets ownerUid at creation time); kept for any project
 * that was somehow created without one.
 */
export async function serverClaimProject(idToken: string, projectId: string): Promise<void> {
  const u = await verifyUser(idToken);
  const store = createServerProjectStore();
  const project = await store.getProject(projectId);
  if (!project) throw new Error("Project not found");
  if (project.ownerUid && project.ownerUid !== u.uid) throw new Error("This project already belongs to another account");
  if (!project.ownerUid) await store.updateProject(projectId, { ownerUid: u.uid } as any);
}

/** One-time migration: bind legacy (ownerless) productions to the configured owner account only. */
export async function serverClaimUnownedProjects(idToken: string): Promise<void> {
  const allowed = process.env.LEGACY_OWNER_EMAIL;
  if (!allowed) return;
  const u = await verifyUser(idToken);
  if ((u.email ?? "").toLowerCase() !== allowed.toLowerCase()) return;
  const store = createServerProjectStore();
  const all = await store.listProjects();
  for (const p of all) {
    if (!p.ownerUid) await store.updateProject(p.id, { ownerUid: u.uid } as any);
  }
}
