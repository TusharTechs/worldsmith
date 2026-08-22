import { GoogleGenAI } from "@google/genai";
import { VideoGenerationProvider, VideoGenerationRequest, GeneratedVideo } from "./video-provider";
import { storeVideo } from "./image-storage";
import { resolveVertexConfig, vertexClientOptions } from "./vertex-provider";
import { withRetry } from "./retry";

// Pricing table: put "fast" first so veo-3.1-fast matches the cheaper rate
const PER_SECOND: { match: string; usd: number }[] = [
  { match: "fast", usd: 0.15 },
  { match: "veo-3", usd: 0.4 },
  { match: "veo-2", usd: 0.35 },
];

export class VeoVideoProvider implements VideoGenerationProvider {
  name = "veo";
  defaultModel: string;
  private client: GoogleGenAI;
  private perSecond: number;

  constructor() {
    const cfg = resolveVertexConfig();
    this.client = new GoogleGenAI(vertexClientOptions(cfg));
    this.defaultModel = process.env.VEO_MODEL ?? "veo-3.1-generate-001";
    this.perSecond =
      parseFloat(process.env.VEO_COST_PER_SECOND ?? "") ||
      (PER_SECOND.find((p) => this.defaultModel.includes(p.match))?.usd ?? 0.4);
  }

  estimateCost(req: VideoGenerationRequest): number {
    return this.perSecond * this.clampDuration(req.durationSeconds);
  }

  private clampDuration(d: number): number {
    if (this.defaultModel.includes("veo-3")) return 8; // veo-3 clips are fixed 8s
    return Math.min(8, Math.max(5, Math.round(d)));
  }

  async generate(req: VideoGenerationRequest): Promise<GeneratedVideo> {
    const t0 = Date.now();

    let operation = await withRetry(
      () =>
        this.client.models.generateVideos({
          model: this.defaultModel,
          prompt: req.prompt,
          image: req.firstFrameBytes
            ? { imageBytes: req.firstFrameBytes, mimeType: req.firstFrameMime ?? "image/png" }
            : undefined,
          config: {
            numberOfVideos: 1,
            durationSeconds: this.clampDuration(req.durationSeconds),
            aspectRatio: req.aspectRatio,
          } as any,
        }),
      { label: "VEO", retries: 4, baseDelayMs: 15000 }
    );

    const maxWait = 10 * 60 * 1000;
    while (!operation.done) {
      if (Date.now() - t0 > maxWait) throw new Error("[VEO] generation timed out after 10m");
      await new Promise((r) => setTimeout(r, 10_000));
      operation = await this.client.operations.getVideosOperation({ operation });
    }

    const gen: any = operation.response?.generatedVideos?.[0];
    const videoObj = gen?.video;
    if (!videoObj) throw new Error("[VEO] no video in operation response");

    let raw: Buffer | null = null;
    if (videoObj.videoBytes) {
      raw = typeof videoObj.videoBytes === "string"
        ? Buffer.from(videoObj.videoBytes, "base64")
        : Buffer.from(videoObj.videoBytes);
    } else if (videoObj.bytesBase64Encoded) {
      raw = Buffer.from(videoObj.bytesBase64Encoded, "base64");
    } else if (videoObj.uri) {
      const res = await fetch(videoObj.uri);
      if (!res.ok) throw new Error(`[VEO] video download failed ${res.status}`);
      raw = Buffer.from(await res.arrayBuffer());
    } else {
      console.error("[VEO] unexpected video object keys:", Object.keys(videoObj));
      throw new Error("[VEO] response has neither bytes nor uri");
    }

    // Normalize: guarantee real MP4 bytes (ftyp at offset 4), never base64 text
    let bytes = raw;
    if (raw.slice(4, 8).toString("ascii") !== "ftyp") {
      const text = raw.slice(0, 400).toString("utf8");
      if (/^[A-Za-z0-9+/=\r\n]+$/.test(text)) {
        bytes = Buffer.from(text.replace(/\s/g, ""), "base64");
      }
    }
    console.log("[VEO] video bytes:", bytes.length, "magic:", bytes.slice(0, 12).toString("hex"));

    const uri = await storeVideo(bytes);

    return {
      provider: "veo",
      model: this.defaultModel,
      uri,
      durationSeconds: this.clampDuration(req.durationSeconds),
      latencyMs: Date.now() - t0,
      costUSD: this.estimateCost(req),
      requestId: (operation as any).name ?? `veo-${Date.now()}`,
      promptUsed: req.prompt,
    };
  }
}