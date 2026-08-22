export interface VideoGenerationRequest {
  prompt: string;
  firstFrameBytes?: string;   // base64 PNG of the shot's first frame
  firstFrameMime?: string;
  durationSeconds: number;
  aspectRatio: "16:9" | "9:16";
  importance?: "HERO" | "NORMAL";
}

export interface GeneratedVideo {
  provider: string;
  model: string;
  uri: string;
  durationSeconds: number;
  latencyMs: number;
  costUSD: number;
  requestId?: string;
  promptUsed: string;
}

export interface VideoGenerationProvider {
  name: string;
  defaultModel: string;
  estimateCost(req: VideoGenerationRequest): number;
  generate(req: VideoGenerationRequest): Promise<GeneratedVideo>;
}