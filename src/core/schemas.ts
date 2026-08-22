import { z } from "zod";

export const SourceSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  timestamp: z.string(),
});

export const ResearchReportSchema = z.object({
  trendingTopics: z.array(z.object({ topic: z.string(), signalStrength: z.number(), sources: z.array(SourceSchema) })),
  audienceSignals: z.string(),
  competingContent: z.array(z.string()),
});

export const OpportunitySchema = z.object({
  hook: z.string(),
  coreConcept: z.string(),
  whyItWorks: z.string(),
  targetEmotion: z.string(),
});

export const CharacterSchema = z.object({
  characterId: z.string().optional(),
  name: z.string(),
  role: z.string(),
  personality: z.string(),
  appearance: z.string(),
  voiceCharacteristics: z.string(),
  referenceAssetId: z.string().optional(),   // ← NEW
});

export const LocationSchema = z.object({
  locationId: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  referenceAssetId: z.string().optional(),   // ← NEW
});

export const PropSchema = z.object({
  propId: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  referenceAssetId: z.string().optional(),   // ← NEW
});

export const WorldBibleSchema = z.object({
  title: z.string(),
  premise: z.string(),
  visualStyle: z.object({
    artDirection: z.string(),
    lighting: z.string(),
    colorLanguage: z.string(),
    cameraLanguage: z.string(),
  }),
  characters: z.array(CharacterSchema),
  locations: z.array(LocationSchema),
  props: z.array(PropSchema).optional(),
  continuityRules: z.array(z.string()),
});

export const ShotGenerationStatusSchema = z.enum(["PENDING", "GENERATING", "QC_FAILED", "COMPLETED"]);

export const ShotSchema = z.object({
  shotId: z.string(),
  duration: z.string(),
  scene: z.string(),
  characters: z.array(z.string()),
  characterIds: z.array(z.string()).optional(),
  location: z.string(),
  locationId: z.string().optional(),
  action: z.string(),
  camera: z.string(),
  lighting: z.string(),
  firstFrame: z.string(),
  lastFrame: z.string(),
  generationPrompt: z.string(),
  continuityRequirements: z.array(z.string()),
  // Generation-era state (Phase 4 writes these)
  generationStatus: ShotGenerationStatusSchema.optional(),
  retryCount: z.number().optional(),
  seed: z.number().optional(),
  parentAssetId: z.string().optional(),
  requiredAssetIds: z.array(z.string()).optional(),
  firstFrameAssetId: z.string().optional(),
  videoAssetId: z.string().optional(),
});

export const StoryboardSchema = z.object({ shots: z.array(ShotSchema) });

export const ProductionPlanSchema = z.object({
  totalShots: z.number(),
  estimatedDuration: z.string(),
  estimatedCostUSD: z.number(),
  recommendedModels: z.object({
    video: z.string(),
    image: z.string(),
    audio: z.string(),
    voice: z.string(),
  }),
  routingStrategy: z.string(),
});

export type ResearchReport = z.infer<typeof ResearchReportSchema>;
export type Opportunity = z.infer<typeof OpportunitySchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type Location = z.infer<typeof LocationSchema>;
export type Prop = z.infer<typeof PropSchema>;
export type WorldBible = z.infer<typeof WorldBibleSchema>;
export type Shot = z.infer<typeof ShotSchema>;
export type Storyboard = z.infer<typeof StoryboardSchema>;
export type ProductionPlan = z.infer<typeof ProductionPlanSchema>;