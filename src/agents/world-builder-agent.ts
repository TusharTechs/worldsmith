import { WorldBibleSchema, WorldBible, Opportunity } from "@/core/schemas";
import { LLMProvider, LLMGenerationResult } from "@/providers/llm-provider";
import { slugify } from "@/core/util";
import { z } from "zod";

export class WorldBuilderAgent {
  constructor(private llm: LLMProvider) {}

  async run(opportunity: Opportunity, style: string, userGoal: string): Promise<LLMGenerationResult<WorldBible>> {
    const prompt = `You are a cinematic world architect.
    The user's creative goal is: "${userGoal}"
    Based on this content opportunity: ${JSON.stringify(opportunity)}
    And the desired visual style: "${style}"
    Create a comprehensive World Bible that fulfills the user's goal exactly (subject matter, protagonist, world).
    Include: a compelling title, premise, visual style details (art direction, lighting, color, camera),
    1-2 main characters (name, role, personality, appearance, voice),
    2-4 locations as objects with "name" and "description",
    1-2 recurring props as objects with "name" and "description",
    and strict continuity rules.
    `;
    const result = await this.llm.generateJson(prompt, WorldBibleSchema);
    return { ...result, data: ensureStableIds(result.data) };
  }
}

function ensureStableIds(wb: WorldBible): WorldBible {
  return {
    ...wb,
    characters: wb.characters.map((c) => ({ ...c, characterId: c.characterId ?? `char-${slugify(c.name)}` })),
    locations: wb.locations.map((l) => ({ ...l, locationId: l.locationId ?? `loc-${slugify(l.name)}` })),
    props: (wb.props ?? []).map((p) => ({ ...p, propId: p.propId ?? `prop-${slugify(p.name)}` })),
  };
}