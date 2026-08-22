import { z } from "zod";

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// TData = the PARSED OUTPUT type (WorldBible, Storyboard...), NOT the schema
export interface LLMGenerationResult<TData> {
  data: TData;
  usage?: LLMUsage;
  latencyMs: number;
  model?: string;
  costUSD?: number;   // ← NEW: actual dollar cost when the provider can compute it
}

export interface LLMProvider {
  generateJson<T extends z.ZodType>(
    prompt: string,
    schema: T
  ): Promise<LLMGenerationResult<z.infer<T>>>;
}