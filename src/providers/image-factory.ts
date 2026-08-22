import { ImageGenerationProvider } from "./image-provider";
import { MockImageGenerationProvider } from "./mock-image-provider";
import { PollinationsImageProvider } from "./pollinations-image-provider";
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
    case "pollinations":
      return new PollinationsImageProvider();
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

export function imageProviderMode(): "GEMINI" | "VERTEX" | "POLLINATIONS" | "MOCK" {
  const n = imageProviderName();
  if (n === "mock") return "MOCK";
  if (n === "pollinations") return "POLLINATIONS";
  if (n === "gemini") return "GEMINI";
  return "VERTEX";
}