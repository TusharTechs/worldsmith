import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { DistributionProvider } from "./distribution-provider";
import { DistributionPackage, DistributionPackageSchema } from "@/core/distribution-schemas";
import { Project } from "@/core/project-schemas";
import { resolveVertexConfig, vertexClientOptions } from "./vertex-provider";
import { withRetry } from "./retry";

export class GeminiDistributionProvider implements DistributionProvider {
  name = "vertex";
  private client: GoogleGenAI;
  private model: string;

  constructor() {
    const cfg = resolveVertexConfig();
    this.client = new GoogleGenAI(vertexClientOptions(cfg));
    this.model = process.env.DISTRIBUTION_MODEL ?? "gemini-2.5-flash";
  }

  async generateDistributionPackage(project: Project): Promise<DistributionPackage> {
    if (!project.worldBible || !project.storyboard) {
      throw new Error("Cannot build distribution package: missing WorldBible or Storyboard");
    }

    const wb = project.worldBible;
    const sb = project.storyboard;

    // Duration-aware narration budget: ~2.0 words/sec of screen time.
    const totalSeconds = sb.shots.reduce((s, sh) => s + (parseFloat(sh.duration) || 0), 0) || 30;
    const maxWords = Math.max(8, Math.round(totalSeconds * 2.0));

    const context = [
      `PRODUCTION TITLE: ${project.title}`,
      `PREMISE: ${wb.premise}`,
      `GENRE/TONE: ${wb.visualStyle.artDirection}. Lighting: ${wb.visualStyle.lighting}`,
      `CHARACTERS: ${wb.characters.map((c) => `${c.name} (${c.role}) — ${c.appearance}`).join("; ")}`,
      `LOCATIONS: ${wb.locations.map((l) => `${l.name} — ${l.description ?? ""}`).join("; ")}`,
      `AUDIENCE INSIGHT: ${project.research?.trendingTopics?.map((t) => t.topic).join(", ") ?? "general audience"}`,
      `OPPORTUNITY HOOK: ${project.opportunity?.hook ?? ""}. Core concept: ${project.opportunity?.coreConcept ?? ""}. Why it works: ${project.opportunity?.whyItWorks ?? ""}. Target emotion: ${project.opportunity?.targetEmotion ?? ""}`,
      `STORYBOARD SHOTS: ${sb.shots.map((s) => `${s.shotId} (${s.duration}s): ${s.action}`).join(" | ")}`,
      `TOTAL DURATION: ${totalSeconds}s`,
    ].join("\n");

    const prompt = [
      "You are the Distribution Director for an autonomous media studio.",
      "Transform the completed production below into a platform-specific distribution campaign.",
      "Every piece of copy must preserve the creative identity of the production — tone, characters, themes.",
      "Do NOT use generic marketing language. Ground every line in the actual story.",
      `narrationScript must be ONE sentence, maximum ${maxWords} words, written to be spoken in under ${totalSeconds} seconds.`,
      `narrationStyle must be a brief voice direction matching the film's mood and desired pacing (e.g., "slow and reverent", "brisk and curious").`,
      "Respond ONLY with valid JSON matching the provided schema.",
      "",
      "PRODUCTION CONTEXT:",
      context,
      "",
      "REQUIRED SCHEMA (JSON):",
      JSON.stringify(z.toJSONSchema(DistributionPackageSchema)),
      "",
      "Use projectId = placeholder; generatedAt = 0. The server will fill the real values.",
    ].join("\n");

    const response = await withRetry(
      () =>
        this.client.models.generateContent({
          model: this.model,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { responseMimeType: "application/json" } as any,
        }),
      { label: "DISTRO", retries: 2, baseDelayMs: 5000 }
    );

    let text = response.text ?? "";
    if (text.startsWith("```json")) text = text.slice(7);
    if (text.endsWith("```")) text = text.slice(0, -3);
    const parsed = JSON.parse(text.trim());
    return DistributionPackageSchema.parse({ ...parsed, projectId: project.id, generatedAt: Date.now() });
  }
}