import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { LLMProvider, LLMGenerationResult } from "./llm-provider";

export class GeminiProvider implements LLMProvider {
  private client: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey: string, model = "gemini-1.5-flash") {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  async generateJson<T extends z.ZodType>(
    prompt: string,
    schema: T
  ): Promise<LLMGenerationResult<z.infer<T>>> {
    const startTime = Date.now();
    const generativeModel = this.client.getGenerativeModel({ model: this.model });
    const jsonSchemaString = JSON.stringify(z.toJSONSchema(schema));
    const fullPrompt = `${prompt}\n\nYou MUST respond with ONLY valid JSON that strictly adheres to the following JSON Schema. Do not include markdown formatting, just the raw JSON object:\n${jsonSchemaString}`;

    const result = await generativeModel.generateContent(fullPrompt);
    const response = result.response;
    let text = response.text();

    if (text.startsWith("```json")) text = text.slice(7);
    if (text.endsWith("```")) text = text.slice(0, -3);
    text = text.trim();

    try {
      const data = schema.parse(JSON.parse(text));
      const usage = response.usageMetadata ? {
        promptTokens: response.usageMetadata.promptTokenCount || 0,
        completionTokens: response.usageMetadata.candidatesTokenCount || 0,
        totalTokens: response.usageMetadata.totalTokenCount || 0,
      } : undefined;

      return { data, usage, latencyMs: Date.now() - startTime, model: this.model };
    } catch (e) {
      console.error("Failed to parse LLM JSON response:", text);
      throw new Error("LLM returned malformed JSON");
    }
  }
}
