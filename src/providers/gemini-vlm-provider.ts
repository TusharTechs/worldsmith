import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { VLMProvider, VLMImageInput } from "./vlm-provider";
import { resolveVertexConfig, vertexClientOptions } from "./vertex-provider";

export class GeminiVLMProvider implements VLMProvider {
  name = "vertex-vlm";
  private client: GoogleGenAI;
  private model: string;
  private perCallCost: number;

  constructor() {
    const cfg = resolveVertexConfig();
    this.client = new GoogleGenAI(vertexClientOptions(cfg));
    this.model = process.env.VLM_MODEL ?? "gemini-2.5-flash";
    this.perCallCost = parseFloat(process.env.VLM_COST_USD ?? "0.001");
  }

  async evaluate<T extends z.ZodType>(prompt: string, images: VLMImageInput[], schema: T) {
    const t0 = Date.now();
    const parts: any[] = [
      { text: `${prompt}\n\nRespond ONLY with valid JSON matching this schema:\n${JSON.stringify(z.toJSONSchema(schema))}` },
    ];
    for (const img of images) {
      if (img.label) parts.push({ text: img.label });
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.bytes.toString("base64") } });
    }

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [{ role: "user", parts }],
      config: { responseMimeType: "application/json" } as any,
    });

    let text = response.text ?? "";
    if (text.startsWith("```json")) text = text.slice(7);
    if (text.endsWith("```")) text = text.slice(0, -3);
    const data = schema.parse(JSON.parse(text.trim()));

    return { data, costUSD: this.perCallCost, latencyMs: Date.now() - t0, model: this.model };
  }
}