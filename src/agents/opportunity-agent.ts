import { OpportunitySchema, ResearchReport } from "@/core/schemas";
import { LLMProvider, LLMGenerationResult } from "@/providers/llm-provider";
import { z } from "zod";

export class OpportunityAgent {
  constructor(private llm: LLMProvider) {}

  async run(research: ResearchReport, userGoal: string): Promise<LLMGenerationResult<z.infer<typeof OpportunitySchema>>> {
    const prompt = `You are a viral content strategist.
    The user's creative goal is: "${userGoal}"
    Below is market research (it may be generic or simulated). Use it only as supporting context.
    Identify the single best content opportunity THAT FULFILLS THE USER'S GOAL (its subject, characters, and setting).
    Research: ${JSON.stringify(research)}
    Define the hook, core concept, why it works, and target emotion.
    `;
    return this.llm.generateJson(prompt, OpportunitySchema);
  }
}