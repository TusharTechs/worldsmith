import { LLMProvider } from "./llm-provider";
import { GeminiProvider } from "./gemini-provider";
import { MockLLMProvider } from "./mock-llm-provider";
import { VertexProvider, resolveVertexConfig } from "./vertex-provider";

/**
 * Language-model provider selection.
 *
 * Google-only by design: Gemini (API key) or Gemini on Vertex AI, plus an offline mock for
 * local development and tests. Third-party inference endpoints were deliberately removed —
 * every model this product reasons with is a Google model, and adding a non-Google endpoint
 * here would break that guarantee.
 */
export function llmProviderName(): string {
  return process.env.LLM_PROVIDER ?? "gemini";
}

export function createLLMProvider(): LLMProvider {
  const name = llmProviderName();

  switch (name) {
    case "mock":
      return new MockLLMProvider();
    case "vertex":
      return new VertexProvider(resolveVertexConfig());
    case "gemini":
    default: {
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) throw new Error("Missing GOOGLE_API_KEY (or set LLM_PROVIDER=mock|vertex)");
      return new GeminiProvider(apiKey);
    }
  }
}
