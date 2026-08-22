import { Asset } from "@/core/asset-schemas";

export type GeneratedImage = {
  provider: string;
  model: string;
  uri: string;
  width: number;
  height: number;
  seed?: number;
  latencyMs: number;
  costUSD: number;
  requestId?: string;
  promptUsed: string;
  negativePromptUsed?: string;
  supportsReferences: boolean;
  referencesUsed?: string[];
};

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed?: number;
  references?: string[];   // URIs of reference images (if provider supports image-to-image)
  metadata?: Record<string, unknown>;
  importance?: "HERO" | "NORMAL";
}

export interface ImageGenerationProvider {
  name: string;
  defaultModel: string;
  supportsReferences: boolean;
  /** Estimate USD before calling — used by BudgetGuard. */
  estimateCost(req: ImageGenerationRequest): number;
  generate(req: ImageGenerationRequest): Promise<GeneratedImage>;
}

export type GeneratedImageResult = {
  image: GeneratedImage;
  asset: Asset;
};