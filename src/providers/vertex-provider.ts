import path from "path";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { LLMProvider, LLMGenerationResult } from "./llm-provider";
import { withRetry } from "./retry";

// Approximate Vertex list pricing, USD per 1M tokens. Override via env if needed.
const PRICING_PER_M: { match: string; input: number; output: number }[] = [
  { match: "gemini-2.5-pro", input: 1.25, output: 10.0 },
  { match: "gemini-2.5-flash", input: 0.3, output: 2.5 },
  { match: "gemini-2.0-flash", input: 0.1, output: 0.4 },
];

export interface VertexConfig {
  projectId: string;
  location: string;
  serviceAccountPath: string;
  model?: string;
}

export function resolveVertexConfig(): VertexConfig {
  const raw = process.env.VERTEX_SERVICE_ACCOUNT_PATH ?? "./firebase-service-account.json";
  return {
    projectId: process.env.VERTEX_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    location: process.env.VERTEX_LOCATION ?? "us-central1",
    serviceAccountPath: path.resolve(process.cwd(), raw),
    model: process.env.VERTEX_LLM_MODEL ?? "gemini-2.5-flash",
  };
}

export class VertexProvider implements LLMProvider {
  private client: GoogleGenAI;
  private model: string;

  constructor(cfg: VertexConfig) {
    if (!cfg.projectId) throw new Error("Vertex requires VERTEX_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID)");
    process.env.GOOGLE_APPLICATION_CREDENTIALS = cfg.serviceAccountPath;
    this.client = new GoogleGenAI({ vertexai: true, project: cfg.projectId, location: cfg.location });
    this.model = cfg.model ?? "gemini-2.5-flash";
  }

  async generateJson<T extends z.ZodType>(prompt: string, schema: T): Promise<LLMGenerationResult<z.infer<T>>> {
    const t0 = Date.now();
    const jsonSchemaString = JSON.stringify(z.toJSONSchema(schema));
    const fullPrompt = `${prompt}\n\nYou MUST respond with ONLY valid JSON that strictly adheres to the following JSON Schema. Do not include markdown formatting, just the raw JSON object:\n${jsonSchemaString}`;

    const response = await withRetry(
    () =>
    this.client.models.generateContent({
      model: this.model,
      contents: fullPrompt,
      config: { responseMimeType: "application/json" },
    }),
    { label: "VERTEX", retries: 3, baseDelayMs: 5000 }
    );
 
    let text = response.text ?? "";
    if (text.startsWith("```json")) text = text.slice(7);
    if (text.endsWith("```")) text = text.slice(0, -3);
    text = text.trim();

    let data: z.infer<T>;
    try {
      data = schema.parse(JSON.parse(text));
    } catch (e) {
      console.error("[VERTEX] Failed to parse JSON response:", text);
      throw new Error("[VERTEX] LLM returned malformed JSON");
    }

    const promptTokens = response.usageMetadata?.promptTokenCount ?? 0;
    const completionTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
    const price = PRICING_PER_M.find((p) => this.model.includes(p.match)) ?? { match: "", input: 0.3, output: 2.5 };
    const costUSD = (promptTokens / 1e6) * price.input + (completionTokens / 1e6) * price.output;

    return {
      data,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: response.usageMetadata?.totalTokenCount ?? promptTokens + completionTokens,
      },
      latencyMs: Date.now() - t0,
      model: this.model,
      costUSD,
    };
  }
}