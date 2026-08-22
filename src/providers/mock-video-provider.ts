import { VideoGenerationProvider, VideoGenerationRequest, GeneratedVideo } from "./video-provider";

export class MockVideoProvider implements VideoGenerationProvider {
  name = "mock";
  defaultModel = "mock-veo-v1";

  estimateCost(): number {
    return 0;
  }

  async generate(req: VideoGenerationRequest): Promise<GeneratedVideo> {
    const t0 = Date.now();
    await new Promise((r) => setTimeout(r, 600));
    return {
      provider: "mock",
      model: this.defaultModel,
      uri: "", // UI shows first-frame preview + MOCK VIDEO badge
      durationSeconds: req.durationSeconds,
      latencyMs: Date.now() - t0,
      costUSD: 0,
      requestId: `mockvid-${Date.now()}`,
      promptUsed: req.prompt,
    };
  }
}