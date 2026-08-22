import { VLMProvider } from "./vlm-provider";
import { GeminiVLMProvider } from "./gemini-vlm-provider";
import { MockVLMProvider } from "./mock-vlm-provider";

export function vlmProviderName(): string {
  return process.env.VLM_PROVIDER ?? "vertex";
}

export function createVLMProvider(): VLMProvider {
  return vlmProviderName() === "mock" ? new MockVLMProvider() : new GeminiVLMProvider();
}

export function vlmProviderMode(): "VERTEX" | "MOCK" {
  return vlmProviderName() === "mock" ? "MOCK" : "VERTEX";
}