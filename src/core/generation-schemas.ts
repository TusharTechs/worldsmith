import { z } from "zod";

export const GenerationImportanceSchema = z.enum(["HERO", "NORMAL"]);
export const GenerationStatusSchema = z.enum([
  "NOT_STARTED",
  "PLANNED",
  "APPROVED",
  "GENERATING",
  "COMPLETED",
  "FAILED_WITH_PARTIAL_ASSETS",
]);

export const GenerationLineItemSchema = z.object({
  assetType: z.string(),     // "CHARACTER_REF" | "LOCATION_REF" | "PROP_REF" | "FIRST_FRAME"
  targetId: z.string(),       // characterId / locationId / propId / shotId
  targetName: z.string(),
  importance: GenerationImportanceSchema.optional(),
  estimatedCostUSD: z.number(),
  provider: z.string(),
  model: z.string(),
});

export const GenerationPlanSchema = z.object({
  totalAssets: z.number(),
  characterRefs: z.number(),
  locationRefs: z.number(),
  propRefs: z.number(),
  shotFirstFrames: z.number(),
  lineItems: z.array(GenerationLineItemSchema),
  estimatedCostUSD: z.number(),
  budgetUSD: z.number().optional(),
  imageProvider: z.string(),
  imageModel: z.string(),
  videoClips: z.number().optional(),
  videoEstimatedCostUSD: z.number().optional(),
  videoProvider: z.string().optional(),
  videoModel: z.string().optional(),
  remainingBudgetUSD: z.number().optional(),
});

export type GenerationImportance = z.infer<typeof GenerationImportanceSchema>;
export type GenerationStatus = z.infer<typeof GenerationStatusSchema>;
export type GenerationLineItem = z.infer<typeof GenerationLineItemSchema>;
export type GenerationPlan = z.infer<typeof GenerationPlanSchema>;