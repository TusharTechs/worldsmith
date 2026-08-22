"use server";
import { z } from "zod";
import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import ffmpegStatic from "ffmpeg-static";
import { createImageProvider } from "@/providers/image-factory";
import { createVideoProvider } from "@/providers/video-factory";
import { createAudioProvider } from "@/providers/audio-factory";
import { createVLMProvider } from "@/providers/vlm-factory";
import { createLLMProvider } from "@/providers/factory";
import { storeVideo, storeImage, fetchReferenceBytes } from "@/providers/image-storage";
import { Assembler } from "@/core/assembler";
import { upscaleImageBytes } from "@/core/ffmpeg";
import { estimateCredits } from "@/core/credits";
import { SocialPostSchema, YouTubeKitCopySchema } from "@/core/distribution-schemas";
import { verifyUser, ensureUser, getUserCredits, spendCredits, adminDb } from "@/store/credits-store";

const execFileAsync = promisify(execFile);

export interface ToolResult { uri?: string; text?: string; costUSD: number; credits: number; provider: string; model: string; }

function dataUrlParts(dataUrl: string) {
  const [head, b64] = dataUrl.split(",");
  return { b64, mime: head.match(/data:(.*?);/)?.[1] ?? "image/png" };
}

/**
 * Resolve an image reference to raw bytes.
 *
 * Accepts a data URL (small pastes still arrive inline) or a stored URI from /api/uploads. Large
 * pictures now travel through the upload route instead of being inlined into an action argument,
 * because Flight caps argument size and a normal photo exceeded it.
 */
async function imageParts(ref: string): Promise<{ b64: string; mime: string }> {
  if (ref.startsWith("data:")) return dataUrlParts(ref);
  const abs = ref.startsWith("/")
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}${ref}`
    : ref;
  const buf = await fetchReferenceBytes(abs);
  if (!buf) throw new Error("Could not read that image — try uploading it again.");
  return { b64: buf.toString("base64"), mime: /\.jpe?g($|\?)/i.test(ref) ? "image/jpeg" : "image/png" };
}

const imagePartsAll = (refs: string[]) => Promise.all(refs.map(imageParts));

async function gate(idToken: string, credits: number): Promise<string> {
  const u = await verifyUser(idToken);
  await ensureUser(u.uid, u.email ?? "");
  const bal = await getUserCredits(u.uid);
  if (bal < credits) throw new Error(`Insufficient credits — need ${credits}, you have ${bal}. Top up in Pricing.`);
  return u.uid;
}

/**
 * Debit credits AFTER a successful (paid) provider call. If the balance changed underneath us
 * (e.g. a concurrent request spent it first), don't silently swallow that — the caller must not
 * hand back a "successful" result the user never actually paid for.
 */
async function settle(uid: string, credits: number): Promise<void> {
  const r = await spendCredits(uid, credits);
  if (!r.ok) {
    console.error(`[TOOLS] settle failed for uid=${uid}: needed ${credits}, balance ${r.balance}`);
    throw new Error("Insufficient credits — your balance changed while this was generating. Top up and try again.");
  }
}

/** Per-user history of everything generated. */
async function recordRun(uid: string, tool: string, kind: string, prompt: string, uri: string | undefined, credits: number, provider: string, model: string) {
  try {
    await adminDb().collection("toolRuns").add({ uid, tool, kind, prompt, uri: uri ?? null, credits, provider, model, at: Date.now() });
  } catch {}
}

export async function serverListToolRuns(idToken: string): Promise<any[]> {
  const u = await verifyUser(idToken);
  const snap = await adminDb().collection("toolRuns").where("uid", "==", u.uid).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a: any, b: any) => (b.at ?? 0) - (a.at ?? 0)).slice(0, 48);
}

async function fetchToBuffer(uri: string): Promise<Buffer> {
  const url = uri.startsWith("/api/") ? `http://localhost:3000${uri}` : uri;
  const res = await fetch(url);
  return Buffer.from(await res.arrayBuffer());
}

async function makeVideo(prompt: string, seconds: number, aspect = "16:9", first?: { b64: string; mime: string }, refs?: { b64: string; mime: string }[]) {
  const provider = createVideoProvider();
  if (seconds <= 8) {
    const req: any = { prompt, durationSeconds: seconds, aspectRatio: aspect };
    if (first) { req.firstFrameBytes = first.b64; req.firstFrameMime = first.mime; }
    if (refs?.length) req.references = refs;
    return provider.generate(req);
  }
  const clips = Math.ceil(seconds / 8);
  const assembler = new Assembler();
  const bufs: Buffer[] = [];
  for (let i = 0; i < clips; i++) {
    const req: any = { prompt, durationSeconds: 8, aspectRatio: aspect };
    if (i === 0 && first) { req.firstFrameBytes = first.b64; req.firstFrameMime = first.mime; }
    const v = await provider.generate(req);
    bufs.push(await fetchToBuffer(v.uri));
  }
  const merged = await assembler.concatVideos(bufs);
  const uri = await storeVideo(merged);
  return { uri, costUSD: clips * 3.2, provider: "veo", model: "veo-3.1-generate-001" };
}

/** Mux a TTS track into a video (replace audio, trim to shorter). */
async function muxVoice(videoUri: string, audioUri: string): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-mux-"));
  try {
    const v = path.join(dir, "v.mp4"); fs.writeFileSync(v, await fetchToBuffer(videoUri));
    const a = path.join(dir, "a.wav"); fs.writeFileSync(a, await fetchToBuffer(audioUri));
    const out = path.join(dir, "out.mp4");
    const bin = (ffmpegStatic as string) || "ffmpeg";
    await execFileAsync(bin, ["-i", v, "-i", a, "-c:v", "copy", "-c:a", "aac", "-shortest", "-y", out]);
    return await storeVideo(fs.readFileSync(out));
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

export async function serverToolTextToImage(idToken: string, prompt: string, width = 1280, height = 720, referenceDataUrls: string[] = []): Promise<ToolResult> {
  const cr = estimateCredits("image");
  const uid = await gate(idToken, cr);
  const p = createImageProvider();
  // ImageGenerationRequest.references is `string[]` (data: URLs or http(s) URLs, resolved via
  // fetchReferenceBytes) — NOT {b64,mime} objects. Passing the parsed object here silently
  // dropped every uploaded reference image against a real (non-mock) provider.
  const req: any = { prompt, width, height, importance: "NORMAL" };
  if (referenceDataUrls.length) req.references = referenceDataUrls;
  const img = await p.generate(req);
  await settle(uid, cr);
  await recordRun(uid, "t2i", "image", prompt, img.uri, cr, img.provider, img.model);
  return { uri: img.uri, costUSD: img.costUSD, credits: cr, provider: img.provider, model: img.model };
}

export async function serverToolTextToVideo(idToken: string, prompt: string, seconds = 8, aspect = "16:9", referenceDataUrls: string[] = []): Promise<ToolResult> {
  const cr = estimateCredits("videoPerSecond", seconds);
  const uid = await gate(idToken, cr);
  const v = await makeVideo(prompt, seconds, aspect, undefined, await imagePartsAll(referenceDataUrls));
  await settle(uid, cr);
  await recordRun(uid, "t2v", "video", prompt, v.uri, cr, v.provider, v.model);
  return { uri: v.uri, costUSD: v.costUSD, credits: cr, provider: v.provider, model: v.model };
}

export async function serverToolImageToVideo(idToken: string, imageDataUrl: string, prompt: string, seconds = 8, aspect = "16:9", instructions = "", referenceDataUrls: string[] = []): Promise<ToolResult> {
  const cr = estimateCredits("videoPerSecond", seconds);
  const uid = await gate(idToken, cr);
  const full = instructions ? `${prompt} Agent direction: ${instructions}` : prompt;
  const v = await makeVideo(full, seconds, aspect, await imageParts(imageDataUrl), await imagePartsAll(referenceDataUrls));
  await settle(uid, cr);
  await recordRun(uid, "i2v", "video", full, v.uri, cr, v.provider, v.model);
  return { uri: v.uri, costUSD: v.costUSD, credits: cr, provider: v.provider, model: v.model };
}

/** Voiceover + Images → Video with agent instructions. */
export async function serverToolFlowToVideo(
  idToken: string, prompt: string, instructions: string, voiceover: string,
  imageDataUrls: string[], seconds = 8, aspect = "16:9", referenceDataUrls: string[] = []
): Promise<ToolResult> {
  const hasVo = voiceover.trim().length > 0;
  const cr = estimateCredits("videoPerSecond", seconds) + (hasVo ? estimateCredits("tts") : 0);
  const uid = await gate(idToken, cr);
  const first = imageDataUrls[0] ? await imageParts(imageDataUrls[0]) : undefined;
  const refs = [...(await imagePartsAll(imageDataUrls.slice(1))), ...(await imagePartsAll(referenceDataUrls))];
  const full = instructions ? `${prompt} Agent direction: ${instructions}` : prompt;
  const v = await makeVideo(full, seconds, aspect, first, refs);
  let finalUri = v.uri;
  let cost = v.costUSD;
  if (hasVo) {
    const ap = createAudioProvider();
    const a = await ap.synthesizeSpeech({ text: voiceover, styleHint: "Natural, clear narration" });
    finalUri = await muxVoice(v.uri, a.uri);
    cost += a.costUSD;
  }
  await settle(uid, cr);
  await recordRun(uid, "flow", "video", full, finalUri, cr, v.provider, v.model);
  return { uri: finalUri, costUSD: cost, credits: cr, provider: v.provider, model: v.model };
}

export async function serverToolTextToSpeech(idToken: string, text: string, voiceName?: string): Promise<ToolResult> {
  const cr = estimateCredits("tts");
  const uid = await gate(idToken, cr);
  const p = createAudioProvider();
  const a = await p.synthesizeSpeech({ text, voiceName, styleHint: "Natural, clear narration" });
  await settle(uid, cr);
  await recordRun(uid, "tts", "audio", text, a.uri, cr, a.provider, a.model);
  return { uri: a.uri, costUSD: a.costUSD, credits: cr, provider: a.provider, model: a.model };
}

/** Upscale a still image (2x or 4x) via ffmpeg's Lanczos scaler — free, deterministic, no provider. */
export async function serverToolUpscaleImage(idToken: string, imageDataUrl: string, factor: 2 | 4 = 2): Promise<ToolResult> {
  const cr = estimateCredits("upscale");
  const uid = await gate(idToken, cr);
  const { b64 } = await imageParts(imageDataUrl);
  const out = await upscaleImageBytes(Buffer.from(b64, "base64"), factor);
  const uri = await storeImage(out.bytes, "image/png");
  await settle(uid, cr);
  await recordRun(uid, "upscale", "image", `${factor}x upscale`, uri, cr, "ffmpeg", "lanczos");
  return { uri, costUSD: 0, credits: cr, provider: "ffmpeg", model: `lanczos-${factor}x` };
}

/** Standalone single-platform post: idea in, copy + one on-brand image out — no production pipeline required. */
export async function serverToolSocialPost(
  idToken: string,
  platform: "instagram" | "tiktok" | "x" | "linkedin" | "facebook" | "pinterest",
  idea: string,
  width = 1200,
  height = 627
): Promise<ToolResult> {
  const cr = estimateCredits("socialPost");
  const uid = await gate(idToken, cr);

  const llm = createLLMProvider();
  const prompt = `Write a single ${platform} post for this idea: "${idea}". Match ${platform}'s tone and format conventions (length, hashtag style). Respond ONLY with JSON matching the schema.`;
  const { data: copy } = await llm.generateJson(prompt, SocialPostSchema);

  const imgProvider = createImageProvider();
  const img = await imgProvider.generate({
    prompt: `Social media creative for ${platform}. Concept: ${copy.imagePromptConcept}. Bold, high-contrast, scroll-stopping composition, no text overlay.`,
    width, height, importance: "HERO",
  });

  await settle(uid, cr);
  const text = `${copy.post}\n\n${copy.hashtags.map((h) => `#${h}`).join(" ")}`;
  await recordRun(uid, "social", "image", text, img.uri, cr, img.provider, img.model);
  return { uri: img.uri, text, costUSD: img.costUSD, credits: cr, provider: img.provider, model: img.model };
}

export interface YouTubeKitResult {
  videoUri: string;
  thumbnailUri: string;
  titles: string[];
  description: string;
  tags: string[];
  costUSD: number;
  credits: number;
}

/** Standalone YouTube kit: one prompt → video + matching thumbnail + title/description/tags. */
export async function serverToolYouTubeKit(
  idToken: string,
  prompt: string,
  seconds = 8,
  aspect: "16:9" | "9:16" = "16:9",
  referenceDataUrls: string[] = []
): Promise<YouTubeKitResult> {
  const videoCr = estimateCredits("videoPerSecond", seconds);
  const thumbCr = estimateCredits("image");
  const cr = videoCr + thumbCr;
  const uid = await gate(idToken, cr);

  const v = await makeVideo(prompt, seconds, aspect, undefined, await imagePartsAll(referenceDataUrls));

  const llm = createLLMProvider();
  const copyPrompt = `Write YouTube metadata (3-5 title options, a description, tags, and a thumbnail concept) for a video about: "${prompt}". Respond ONLY with JSON matching the schema.`;
  const { data: copy } = await llm.generateJson(copyPrompt, YouTubeKitCopySchema);

  const imgProvider = createImageProvider();
  const thumb = await imgProvider.generate({
    prompt: `YouTube thumbnail. Concept: ${copy.thumbnailConcept}. Bold, high-contrast, dramatic, text-safe composition, no text.`,
    width: 1280,
    height: 720,
    importance: "HERO",
  });

  await settle(uid, cr);
  await recordRun(uid, "ytkit", "video", prompt, v.uri, cr, v.provider, v.model);

  return {
    videoUri: v.uri,
    thumbnailUri: thumb.uri,
    titles: copy.titles,
    description: copy.description,
    tags: copy.tags,
    costUSD: v.costUSD + thumb.costUSD,
    credits: cr,
  };
}

export async function serverToolImageToPrompt(idToken: string, imageDataUrl: string): Promise<ToolResult> {
  const cr = estimateCredits("prompt");
  const uid = await gate(idToken, cr);
  const { b64, mime } = await imageParts(imageDataUrl);
  const vlm = createVLMProvider();
  const res = await vlm.evaluate(
    "Describe this image as a detailed generation prompt that could recreate it (subject, style, lighting, composition, medium). Respond with JSON { prompt }.",
    [{ bytes: Buffer.from(b64, "base64"), mimeType: mime }],
    z.object({ prompt: z.string() })
  );
  await settle(uid, cr);
  await recordRun(uid, "i2p", "text", "image→prompt", undefined, cr, "vlm", res.model ?? "");
  return { text: res.data.prompt, costUSD: res.costUSD, credits: cr, provider: "vlm", model: res.model ?? "" };
}