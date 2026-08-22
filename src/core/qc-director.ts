import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";
import ffmpegPath from "ffmpeg-static";
import { VLMProvider, VLMImageInput } from "@/providers/vlm-provider";
import { createVLMProvider } from "@/providers/vlm-factory";
import { fetchReferenceBytes } from "@/providers/image-storage";
import { QCReportSchema, QCReport, QCRecommendation, QCStatus } from "./qc-schemas";
import { Shot, WorldBible } from "./schemas";
import { Asset } from "./asset-schemas";

const execFileAsync = promisify(execFile);

export interface QCOutcome {
  report: QCReport;
  recommendation: QCRecommendation;
  status: QCStatus;
  costUSD: number;
  latencyMs: number;
  model?: string;
}

const UNAVAILABLE_REPORT: QCReport = {
  passed: false,
  confidence: 0,
  checks: {
    characterPresent: false, characterConsistentWithReference: false, locationConsistent: false,
    requiredPropsPresent: false, visualStyleConsistent: false, continuityViolation: false, compositionAcceptable: false,
  },
  issues: ["asset bytes unavailable"],
};

export class QCDirector {
  private vlm: VLMProvider;

  constructor(vlm?: VLMProvider) {
    this.vlm = vlm ?? createVLMProvider();
  }

  private recommend(report: QCReport): QCRecommendation {
    if (report.passed && report.confidence >= 0.7) return "PASS";
    if (!report.passed && report.confidence >= 0.6) return "RETRY";
    return "NEEDS_REVIEW";
  }

  private toStatus(rec: QCRecommendation): QCStatus {
    if (rec === "PASS") return "PASSED";
    if (rec === "RETRY") return "FAILED";
    return "NEEDS_REVIEW";
  }

  private finish(res: { data: QCReport; costUSD: number; latencyMs: number; model?: string }): QCOutcome {
    const recommendation = this.recommend(res.data);
    return { report: res.data, recommendation, status: this.toStatus(recommendation), costUSD: res.costUSD, latencyMs: res.latencyMs, model: res.model };
  }

  private async loadBytes(uri?: string): Promise<Buffer | null> {
    if (!uri) return null;
    const fetchable = uri.startsWith("/api/") ? `http://localhost:3000${uri}` : uri;
    return fetchReferenceBytes(fetchable);
  }

  /** Reference QC — character sheets & environment plates vs written description. */
  async evaluateReference(asset: Asset, description: string, kind: string): Promise<QCOutcome> {
    const bytes = await this.loadBytes(asset.uri);
    if (!bytes) return { report: UNAVAILABLE_REPORT, recommendation: "NEEDS_REVIEW", status: "NEEDS_REVIEW", costUSD: 0, latencyMs: 0 };

    const prompt = [
      `You are an art director reviewing a ${kind} for an animated production.`,
      `WRITTEN DESCRIPTION: ${description}`,
      "Evaluate whether the image is a usable visual anchor for that description: identity, key features, colors, mood.",
      "Minor stylistic liberties are acceptable. passed=true unless there is a concrete mismatch.",
      "List concrete mismatches in 'issues'.",
    ].join("\n");

    const res = await this.vlm.evaluate(prompt, [{ bytes, mimeType: "image/png", label: kind.toUpperCase() }], QCReportSchema);
    return this.finish(res);
  }

  /** STAGE A — first frame vs shot requirements. Static anchor: motion is NOT judged here. */
  async evaluateFirstFrame(shot: Shot, frame: Asset, wb: WorldBible): Promise<QCOutcome> {
    const frameBytes = await this.loadBytes(frame.uri);
    if (!frameBytes) return { report: UNAVAILABLE_REPORT, recommendation: "NEEDS_REVIEW", status: "NEEDS_REVIEW", costUSD: 0, latencyMs: 0 };

    const characters = (shot.characterIds ?? [])
      .map((cid) => wb.characters.find((c) => c.characterId === cid))
      .filter(Boolean);
    const loc = wb.locations.find((l) => l.locationId === shot.locationId);

    const prompt = [
      "You are a film continuity supervisor for an animated production.",
      `SHOT ACTION: ${shot.action}`,
      `CHARACTERS EXPECTED: ${characters.map((c) => `${c!.name} — ${c!.appearance}`).join("; ") || "none"}`,
      `LOCATION EXPECTED: ${loc ? `${loc.name} — ${loc.description ?? ""}` : shot.location}`,
      `VISUAL STYLE: ${wb.visualStyle.artDirection}. ${wb.visualStyle.lighting}`,
      `CONTINUITY RULES: ${shot.continuityRequirements.join("; ")}`,
      "The image labeled GENERATED FIRST FRAME is the asset under review.",
      "IMPORTANT: a first frame is a STATIC visual anchor. Do NOT fail it because motion or action verbs (walks, runs, turns, shifts) are not depicted; judge whether the captured moment is plausible for the action.",
      "passed=true ONLY if: expected character present and recognizable, location consistent, required props present, visual style consistent, no continuity violation, composition acceptable.",
      "List concrete issues in 'issues'.",
    ].join("\n");

    const res = await this.vlm.evaluate(
      prompt,
      [{ bytes: frameBytes, mimeType: "image/png", label: "GENERATED FIRST FRAME" }],
      QCReportSchema
    );
    return this.finish(res);
  }

  /** STAGE B — video samples vs approved first frame + continuity rules. Motion IS judged here. */
  async evaluateVideo(shot: Shot, video: Asset, firstFrame: Asset | undefined, wb: WorldBible): Promise<QCOutcome> {
    const samples = await this.extractVideoFrames(video.uri ?? "", 3);
    if (samples.length === 0) {
      return { report: { ...UNAVAILABLE_REPORT, issues: ["could not sample video frames"] }, recommendation: "NEEDS_REVIEW", status: "NEEDS_REVIEW", costUSD: 0, latencyMs: 0 };
    }

    const images: VLMImageInput[] = samples.map((b, i) => ({
      bytes: b, mimeType: "image/png", label: `VIDEO SAMPLE ${i + 1}`,
    }));
    const firstFrameBytes = await this.loadBytes(firstFrame?.uri);
    if (firstFrameBytes) images.push({ bytes: firstFrameBytes, mimeType: "image/png", label: "APPROVED FIRST FRAME" });

    const prompt = [
      "You are a film continuity supervisor reviewing sequential samples from a generated video clip.",
      `SHOT ACTION: ${shot.action}`,
      `CONTINUITY RULES: ${shot.continuityRequirements.join("; ")}`,
      "Images labeled VIDEO SAMPLE are sequential frames from the clip; APPROVED FIRST FRAME (if present) is the visual anchor.",
      "Here you DO judge motion plausibility: character present and consistent across samples, environment stable, no identity/prop/style breaks.",
      "passed=true ONLY if there is no continuity violation across the samples.",
    ].join("\n");

    const res = await this.vlm.evaluate(prompt, images, QCReportSchema);
    return this.finish(res);
  }

  /** Deterministic, non-AI frame sampling via ffmpeg (bundled binary, PATH fallback). */
  async extractVideoFrames(uri: string, count = 3): Promise<Buffer[]> {
    let file: string;
    let tmpVideo: string | null = null;

    if (uri.startsWith("/api/")) {
      const id = uri.split("/").pop()!.replace(/[^a-zA-Z0-9-]/g, "");
      file = path.join(process.cwd(), ".data", "videos", `${id}.mp4`);
      if (!fs.existsSync(file)) return [];
    } else {
      const buf = await this.loadBytes(uri);
      if (!buf) return [];
      tmpVideo = path.join(os.tmpdir(), `ws-qc-${Date.now()}.mp4`);
      fs.writeFileSync(tmpVideo, buf);
      file = tmpVideo;
    }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-qc-frames-"));
    const outPattern = path.join(dir, "f-%d.png");
    try {
      await this.runFfmpeg(["-i", file, "-vf", "fps=1/2", "-frames:v", String(count), "-y", outPattern]);
      const frames: Buffer[] = [];
      for (let i = 1; i <= count; i++) {
        const p = path.join(dir, `f-${i}.png`);
        if (fs.existsSync(p)) frames.push(fs.readFileSync(p));
      }
      return frames;
    } catch (e: any) {
      console.error("[QC] ffmpeg frame extraction failed:", e?.message ?? e, "| stderr:", e?.stderr?.toString?.() ?? "");
      return [];
    } finally {
      try { if (tmpVideo) fs.unlinkSync(tmpVideo); } catch {}
    }
  }

  private async runFfmpeg(args: string[]): Promise<void> {
    const candidates = [ffmpegPath as string, "ffmpeg"].filter(Boolean);
    let lastErr: any;
    for (const bin of candidates) {
      try {
        await execFileAsync(bin, args);
        return;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  }
}