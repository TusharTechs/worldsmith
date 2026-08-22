import { z } from "zod";

export interface VLMImageInput {
  bytes: Buffer;
  mimeType: string;
  label?: string;
}

export interface VLMProvider {
  name: string;
  evaluate<T extends z.ZodType>(
    prompt: string,
    images: VLMImageInput[],
    schema: T
  ): Promise<{ data: z.infer<T>; costUSD: number; latencyMs: number; model?: string }>;
}