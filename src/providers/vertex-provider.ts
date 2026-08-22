import fs from "fs";
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
  /** Inline service-account credentials, for hosts with no writable filesystem. */
  credentials?: Record<string, unknown>;
  model?: string;
}

/**
 * Client options shared by every Vertex-backed provider.
 *
 * Credentials arrive one of two ways. Locally it is a file on disk and the SDK picks it up through
 * GOOGLE_APPLICATION_CREDENTIALS. On a serverless host there is no such file — the repo cannot ship
 * one and the filesystem is read-only — so the same JSON is supplied inline and handed to the auth
 * library directly. Without this, every Vertex call fails in deployment while working locally.
 */
export function vertexClientOptions(cfg: VertexConfig) {
  if (cfg.credentials) {
    return {
      vertexai: true as const,
      project: cfg.projectId,
      location: cfg.location,
      googleAuthOptions: { credentials: cfg.credentials },
    };
  }
  process.env.GOOGLE_APPLICATION_CREDENTIALS = cfg.serviceAccountPath;
  return { vertexai: true as const, project: cfg.projectId, location: cfg.location };
}

/**
 * Service-account JSON supplied through the environment rather than a file.
 *
 * Falls back to FIREBASE_SERVICE_ACCOUNT_JSON because it is the same service account in practice,
 * and requiring it twice is a deployment footgun.
 */
function parseInlineCredentials(): Record<string, unknown> | undefined {
  const raw = process.env.VERTEX_SERVICE_ACCOUNT_JSON ?? process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    console.error("[VERTEX] service-account JSON in the environment is not valid JSON — ignoring it.");
    return undefined;
  }
}

/**
 * The service account itself, from wherever it is available.
 *
 * Inline JSON first, then the file on disk. Anything needing admin credentials — Firestore, Auth,
 * the billing webhook — must go through this rather than reading the path directly, or it works
 * locally and throws on a host that has no filesystem to read.
 */
export function resolveServiceAccount(): Record<string, unknown> {
  const inline = parseInlineCredentials();
  if (inline) return inline;
  const cfg = resolveVertexConfig();
  try {
    return JSON.parse(fs.readFileSync(cfg.serviceAccountPath, "utf8"));
  } catch (e) {
    // Missing credentials surface as an ENOENT deep inside firebase-admin, which reaches the
    // browser as a blank 500 and a minified React error — every route that touches Auth or
    // Firestore fails at once with nothing naming the cause. Say what is actually wrong.
    throw new Error(
      "No Firebase/Vertex service account available. Set VERTEX_SERVICE_ACCOUNT_JSON (or " +
      "FIREBASE_SERVICE_ACCOUNT_JSON) to the service-account JSON on hosts with no filesystem, " +
      `or provide the file at ${cfg.serviceAccountPath} locally. Underlying error: ${(e as Error).message}`
    );
  }
}

export function resolveVertexConfig(): VertexConfig {
  const raw = process.env.VERTEX_SERVICE_ACCOUNT_PATH ?? "./firebase-service-account.json";
  return {
    projectId: process.env.VERTEX_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    location: process.env.VERTEX_LOCATION ?? "us-central1",
    serviceAccountPath: path.resolve(process.cwd(), raw),
    credentials: parseInlineCredentials(),
    model: process.env.VERTEX_LLM_MODEL ?? "gemini-2.5-flash",
  };
}

export class VertexProvider implements LLMProvider {
  private client: GoogleGenAI;
  private model: string;

  constructor(cfg: VertexConfig) {
    if (!cfg.projectId) throw new Error("Vertex requires VERTEX_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID)");
    this.client = new GoogleGenAI(vertexClientOptions(cfg));
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