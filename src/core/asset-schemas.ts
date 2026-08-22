import { z } from "zod";
import { QCReportSchema, QCStatusSchema } from "./qc-schemas";

export const AssetTypeSchema = z.enum(["IMAGE", "VIDEO", "AUDIO", "VOICE", "MUSIC"]);
export const AssetStatusSchema = z.enum(["PENDING", "GENERATING", "COMPLETED", "FAILED"]);

export const AssetSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  shotId: z.string().optional(),
  characterId: z.string().optional(),
  locationId: z.string().optional(),
  type: AssetTypeSchema,
  provider: z.string(),
  model: z.string(),
  prompt: z.string(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  uri: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  status: AssetStatusSchema,
  retryCount: z.number().optional(),
  seed: z.number().optional(),
  parentAssetIds: z.array(z.string()).optional(),
  qcReport: QCReportSchema.optional(),
  qcStatus: QCStatusSchema.optional(),
  costUSD: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const CostEntrySchema = z.object({
  at: z.number(),
  kind: z.string(),        // "llm" | "research" | "image" | "video" | "audio"
  provider: z.string(),
  model: z.string().optional(),
  costUSD: z.number(),
  note: z.string().optional(),
});

export type Asset = z.infer<typeof AssetSchema>;
export type CostEntry = z.infer<typeof CostEntrySchema>;