/**
 * Image provider selection.
 *
 * Google-only, matching the LLM factory: Gemini (API key) or Gemini on Vertex AI, plus an
 * offline mock. A third-party image endpoint used to be selectable here, which quietly broke
 * the guarantee the rest of the system makes — every model this product generates with is a
 * Google model. Do not add a non-Google endpoint back.
 */
import { ImageGenerationProvider } from "./image-provider";
import { MockImageGenerationProvider } from "./mock-image-provider";
import { GeminiImageProvider } from "./gemini-image-provider";
import { VertexImageProvider } from "./vertex-image-provider";
import { resolveVertexConfig } from "./vertex-provider";

export function imageProviderName(): string {
  return process.env.IMAGE_PROVIDER ?? "gemini";
}

export function createImageProvider(): ImageGenerationProvider {
  switch (imageProviderName()) {
    case "mock":
      return new MockImageGenerationProvider();
    case "vertex":
      return new VertexImageProvider(resolveVertexConfig());
    case "gemini":
    default: {
      const key = process.env.GOOGLE_API_KEY;
      if (!key) throw new Error("IMAGE_PROVIDER=gemini requires GOOGLE_API_KEY");
      return new GeminiImageProvider(key);
    }
  }
}

export function imageProviderMode(): "GEMINI" | "VERTEX" | "MOCK" {
  const n = imageProviderName();
  if (n === "mock") return "MOCK";
  if (n === "gemini") return "GEMINI";
  return "VERTEX";
}