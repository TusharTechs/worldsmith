import { ProductionPlanSchema, Storyboard } from "@/core/schemas";
import { LLMProvider, LLMGenerationResult } from "@/providers/llm-provider";
import { z } from "zod";

/**
 * The models the pipeline actually calls. These are facts about this system, not a menu for the
 * planner to choose from — the previous prompt asked the LLM to "recommend" models and named
 * Runway, Luma, Midjourney and ElevenLabs as examples, so every plan confidently told the user
 * their film would be routed through third-party tools this product does not use and cannot
 * call. The stack is stated, and the model is left to reason only about sequencing.
 */
const STACK = {
  video: "Veo 3.1 (Google Vertex AI)",
  image: "gemini-2.5-flash-image (Google Vertex AI)",
  audio: "Native Veo audio, mixed with FFmpeg",
  voice: "Gemini TTS (Google Vertex AI)",
} as const;

export class ProductionPlannerAgent {
  constructor(private llm: LLMProvider) {}

  async run(storyboard: Storyboard): Promise<LLMGenerationResult<z.infer<typeof ProductionPlanSchema>>> {
    const prompt = `You are a production manager for an autonomous film pipeline.

Storyboard: ${JSON.stringify(storyboard)}

This pipeline runs on a fixed stack. Do not propose alternatives, and do not mention any
third-party tool — these exact values must be returned in recommendedModels:
  video: "${STACK.video}"
  image: "${STACK.image}"
  audio: "${STACK.audio}"
  voice: "${STACK.voice}"

Produce the production plan:
- estimatedCostUSD: total, using $0.05 per second of video, $0.02 per generated still, $0.10 for the audio pass.
- estimatedDuration: total runtime of the storyboard as HH:MM:SS.
- totalShots: must equal the exact number of shots in the storyboard.
- routingStrategy: how THIS pipeline should sequence the work — which stills must exist before
  which clips, where continuity checks gate the next step, what can run in parallel, and where a
  human approval gate belongs. Write it as ordered steps naming only the stack above.`;

    const result = await this.llm.generateJson(prompt, ProductionPlanSchema);
    // Belt and braces: a model that ignores the instruction can't put a competitor's name in
    // front of the user, because the field it would land in is overwritten with the real stack.
    return { ...result, data: { ...result.data, recommendedModels: { ...STACK } } };
  }
}
