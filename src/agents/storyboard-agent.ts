import { StoryboardSchema, Storyboard, WorldBible } from "@/core/schemas";
import { LLMProvider, LLMGenerationResult } from "@/providers/llm-provider";
import { z } from "zod";

export class StoryboardAgent {
  constructor(private llm: LLMProvider) {}

  async run(worldBible: WorldBible, durationSec: number, userGoal: string): Promise<LLMGenerationResult<Storyboard>> {
    const cast = worldBible.characters.map((c) => `${c.characterId}: ${c.name}`).join(", ");
    const places = worldBible.locations.map((l) => `${l.locationId}: ${l.name}`).join(", ");
    const prompt = `You are an expert cinematographer and storyboard artist.
    The user's creative goal is: "${userGoal}"
    Based on this World Bible: ${JSON.stringify(worldBible)}
    Create a shot-by-shot storyboard for a ${durationSec}-second video that fulfills the user's goal.
    Break it down into distinct shots of 3-6 seconds each.
    CRITICAL: The sum of all shot durations must equal EXACTLY ${durationSec} seconds. Verify the arithmetic before responding.
    For each shot: list character names in "characters" and their IDs in "characterIds" (cast: ${cast});
    put the location name in "location" and its ID in "locationId" (locations: ${places}).
    Provide camera, lighting, action, first/last frames, and a generation prompt for an AI video model.
    Respect the World Bible continuity rules in continuityRequirements.
    `;
    const result = await this.llm.generateJson(prompt, StoryboardSchema);
    return { ...result, data: linkIds(result.data, worldBible) };
  }
}

function linkIds(board: Storyboard, wb: WorldBible): Storyboard {
  const charByName = new Map(wb.characters.map((c) => [c.name.toLowerCase(), c.characterId ?? ""]));
  const locByName = new Map(wb.locations.map((l) => [l.name.toLowerCase(), l.locationId ?? ""]));
  return {
    shots: board.shots.map((s) => ({
      ...s,
      characterIds: s.characterIds?.length
        ? s.characterIds
        : (s.characters.map((n) => charByName.get(n.toLowerCase())).filter(Boolean) as string[]),
      locationId: s.locationId ?? locByName.get(s.location.toLowerCase()),
    })),
  };
}