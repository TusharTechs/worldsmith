import { z } from "zod";
import { LLMProvider, LLMGenerationResult } from "./llm-provider";

const CANNED_QUERIES = {
  queries: [
    "tiny robot animation trending short-form video 2026",
    "emotional AI robot shorts audience retention benchmarks",
  ],
};

const CANNED_RESEARCH = {
  trendingTopics: [
    {
      topic: "Abandoned-robot emotional shorts",
      signalStrength: 0.93,
      sources: [
        { title: "Short-form animation watch-through benchmark Q3-2026", url: "https://mock.worldsmith.dev/reports/q3-animation", snippet: "Emotional robot narratives average 78% completion on Shorts, 2.4x niche median.", timestamp: "2026-08-11T08:30:00Z" },
        { title: "'Tiny robot' search interest climbing", url: "https://mock.worldsmith.dev/signals/tiny-robot", snippet: "+41% week-over-week search growth for 'tiny robot animation'.", timestamp: "2026-08-14T17:05:00Z" },
      ],
    },
    {
      topic: "Wordless cinematic storytelling",
      signalStrength: 0.81,
      sources: [
        { title: "Global retention patterns in silent shorts", url: "https://mock.worldsmith.dev/reports/silent-shorts", snippet: "Dialogue-free shorts show 31% higher international share rate.", timestamp: "2026-08-09T12:00:00Z" },
      ],
    },
  ],
  audienceSignals: "Core: 18-34 animation/sci-fi fans with WALL-E-lineage nostalgia; peak engagement 7-11pm; strong share behavior for emotional gut-punch with hopeful ending.",
  competingContent: [
    "Lofi robot loops (low narrative, high volume)",
    "Raw AI robot clips with no continuity (high novelty, low retention)",
    "Pixar-style fan shorts (high quality, sparse cadence)",
  ],
};

const CANNED_OPPORTUNITY = {
  hook: "Everyone abandons things. This robot refuses to abandon its human.",
  coreConcept: "A wordless 60-second cinematic journey of a tiny robot crossing a hostile rain-soaked city, guided only by a dying signal.",
  whyItWorks: "Robot nostalgia + loss + hope is a proven emotional triple in short-form; wordless storytelling crosses languages and maximizes completion and rewatches.",
  targetEmotion: "Bittersweet hope",
};

const CANNED_WORLDBIBLE = {
  title: "SIGNAL LOST",
  premise: "After the evacuation, a palm-sized helper robot wakes alone and crosses the drowned city to find the human who forgot it.",
  visualStyle: {
    artDirection: "Premium stylized 3D animation with painterly textures",
    lighting: "Motivated practicals, neon reflections on wet surfaces, amber-vs-teal contrast",
    colorLanguage: "Teal rain shadows, amber hope accents; red reserved for the scarf",
    cameraLanguage: "Low angles to emphasize scale; slow push-ins on emotional beats",
  },
  characters: [
    {
      characterId: "char-pip-7",
      name: "PIP-7",
      role: "Protagonist - abandoned helper robot",
      personality: "Loyal, curious, quietly determined",
      appearance: "Knee-high rounded chassis, faded cream enamel, cracked left eye lens, red scarf fragment clamped in gripper",
      voiceCharacteristics: "No speech; expressive whirs and chimes",
    },
    {
      characterId: "char-moth",
      name: "MOTH",
      role: "Antagonist turned ally - scavenger drone",
      personality: "Twitchy, greedy, ultimately curious",
      appearance: "Angular rusted drone, mismatched panels, one flickering red optic",
      voiceCharacteristics: "Static clicks and buzzes",
    },
  ],
  locations: [
    { locationId: "loc-transit", name: "Flooded transit station", description: "Drowned concourse under a dead departure board" },
    { locationId: "loc-streets", name: "Rain-soaked megacity streets", description: "Neon avenues reflected in black water" },
    { locationId: "loc-rooftop", name: "Rooftop antenna field", description: "Lattice of dead antennas above the fog line" },
    { locationId: "loc-4b", name: "Apartment 4B hallway", description: "Warm interior light behind a half-open door" },
  ],
  props: [
    { propId: "prop-scarf", name: "Red scarf fragment", description: "Frayed red fabric clamped in PIP-7's gripper" },
  ],
  continuityRules: [
    "PIP-7's cracked left eye lens always glows amber",
    "The red scarf fragment is always visible",
    "Rain present in all exterior shots",
    "Scale rule: PIP-7 never appears larger than a house cat",
  ],
};

const CANNED_STORYBOARD = {
  shots: [
    {
      shotId: "01", duration: "5s", scene: "Power-on", characters: ["PIP-7"], location: "Flooded transit station",
      action: "PIP-7 powers on beneath a dead departure board, shaking off rust and water.",
      camera: "Extreme close-up pulling back to wide reveal", lighting: "Cold blue dawn, single amber eye glow",
      firstFrame: "Black screen with a faint amber spark", lastFrame: "Tiny robot dwarfed by vast empty station",
      generationPrompt: "Cinematic animated short, tiny rusted robot waking in flooded train station, cold blue dawn, amber eye glow, volumetric fog, premium 3D animation",
      continuityRequirements: ["Cracked left eye lens glows amber", "Red scarf fragment in right gripper"],
    },
    {
      shotId: "02", duration: "8s", scene: "The clue", characters: ["PIP-7"], location: "Flooded transit station",
      action: "PIP-7 projects a flickering hologram of its owner; the signal arrow points into the city core.",
      camera: "Over-the-shoulder into hologram light", lighting: "Cyan hologram against dark rust",
      firstFrame: "PIP-7 staring at a dead screen", lastFrame: "Hologram arrow pointing into the city",
      generationPrompt: "Tiny robot projecting flickering cyan hologram of a human, dark flooded station, emotional cinematic animation",
      continuityRequirements: ["Amber eye glow", "Scarf fragment visible"],
    },
    {
      shotId: "03", duration: "10s", scene: "The crossing", characters: ["PIP-7"], location: "Rain-soaked megacity streets",
      action: "PIP-7 ferries across flooded streets on a bottle-cap raft, neon signs reflecting in black water.",
      camera: "Low-angle tracking at water level", lighting: "Neon reflections, heavy rain",
      firstFrame: "Robot at curb of flooded avenue", lastFrame: "Raft drifting under giant neon sign",
      generationPrompt: "Tiny robot on makeshift raft crossing neon-lit flooded street at night, rain, reflections, cinematic animation",
      continuityRequirements: ["Rain present", "Scarf fragment visible", "Scale rule respected"],
    },
    {
      shotId: "04", duration: "12s", scene: "The scavenger", characters: ["PIP-7", "MOTH"], location: "Rain-soaked megacity streets",
      action: "MOTH dives in to steal the scarf fragment; PIP-7 shields it, and MOTH retreats, intrigued.",
      camera: "Handheld-style quick cuts, then slow push-in on PIP-7", lighting: "Flickering red optic vs steady amber",
      firstFrame: "MOTH silhouette above rooftop edge", lastFrame: "MOTH hovering, curious, at a distance",
      generationPrompt: "Rusted angular drone confronting tiny cream robot over red scarf fragment, rain, tense cinematic animation",
      continuityRequirements: ["MOTH red optic flickers", "Scarf never leaves frame"],
    },
    {
      shotId: "05", duration: "12s", scene: "The boost", characters: ["PIP-7", "MOTH"], location: "Rooftop antenna field",
      action: "MOTH lifts PIP-7 to a dead antenna; PIP-7 boosts the signal and a single window lights up across the city.",
      camera: "Crane shot rising through antenna lattice", lighting: "Storm break, first warm light",
      firstFrame: "Antenna field in blue gloom", lastFrame: "One warm window glowing in distant tower",
      generationPrompt: "Tiny robot atop antenna array boosting signal, one warm window lighting across rainy city, hopeful cinematic animation",
      continuityRequirements: ["Amber eye glow", "Warm light reserved for the owner window"],
    },
    {
      shotId: "06", duration: "13s", scene: "Apartment 4B", characters: ["PIP-7"], location: "Apartment 4B hallway",
      action: "PIP-7 reaches the door; a handwritten note reads 'I never forgot you.' The amber glow softens. End card.",
      camera: "Slow dolly to the note, then wide on PIP-7", lighting: "Warm interior practicals",
      firstFrame: "Dark hallway, door 4B ajar", lastFrame: "PIP-7 hugging the note, amber glow soft",
      generationPrompt: "Tiny robot reading handwritten note at apartment door, warm light, emotional ending, cinematic animation",
      continuityRequirements: ["Amber glow softens only here", "Scarf fragment held against note"],
    },
  ],
};

const CANNED_PRODUCTION_PLAN = {
  totalShots: 6,
  estimatedDuration: "60s",
  estimatedCostUSD: 6.4,
  recommendedModels: {
    video: "Runway Gen-3 Alpha (hero shots) / Luma Dream Machine (fallback)",
    image: "Midjourney v6 (first-frame continuity references)",
    audio: "ElevenLabs (SFX bed)",
    voice: "ElevenLabs expressive whirs preset",
  },
  routingStrategy: "Route emotional hero beats (04-06) to Gen-3 for fidelity; route environment shots (01-03) to Luma at lower cost; lock continuity with Midjourney first-frames; one seeded retry per failed shot before fallback.",
};

// Standalone tools (no World Bible/storyboard context) get their own canned shapes so the
// same mock-JSON mechanism (match by which schema the caller's request happens to satisfy)
// works for them too.
const CANNED_SOCIAL_POST = {
  post: "One idea. Every platform. Worldsmith takes it from a prompt to a finished creative — no production pipeline required.",
  hashtags: ["ai", "contentcreation", "worldsmith", "socialmedia"],
  imagePromptConcept: "Bold, high-contrast hero image matching the post's idea, scroll-stopping composition, no text overlay",
};

const CANNED_YOUTUBE_KIT = {
  titles: ["This Changes Everything", "I Tried This So You Don't Have To", "The Truth About This Idea"],
  description: "A short built end-to-end from a single prompt — video, thumbnail, and metadata, generated together.",
  tags: ["shorts", "ai video", "content creation", "worldsmith"],
  thumbnailConcept: "Dramatic close-up with bold title-safe composition and high contrast",
};

const CANNED_PAYLOADS: unknown[] = [
  CANNED_QUERIES,
  CANNED_RESEARCH,
  CANNED_OPPORTUNITY,
  CANNED_WORLDBIBLE,
  CANNED_STORYBOARD,
  CANNED_PRODUCTION_PLAN,
  CANNED_SOCIAL_POST,
  CANNED_YOUTUBE_KIT,
];

export class MockLLMProvider implements LLMProvider {
  async generateJson<T extends z.ZodType>(_prompt: string, schema: T): Promise<LLMGenerationResult<z.infer<T>>> {    const startTime = Date.now();
    await new Promise((r) => setTimeout(r, 900));
    for (const payload of CANNED_PAYLOADS) {
      const result = schema.safeParse(payload);
      if (result.success) {
        return {
          data: result.data,
          usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
          latencyMs: Date.now() - startTime,
          model: "mock-model"
        };
      }
    }
    throw new Error("[MOCK] No canned payload matched the requested schema.");
  }
}