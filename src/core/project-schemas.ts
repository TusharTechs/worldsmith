import { z } from "zod";
import {
  ResearchReportSchema,
  OpportunitySchema,
  WorldBibleSchema,
  StoryboardSchema,
  ProductionPlanSchema,
} from "./schemas";
import { ResearchEvidenceSchema } from "./research-schemas";
import { CostEntrySchema } from "./asset-schemas";
import { GenerationPlanSchema, GenerationStatusSchema } from "./generation-schemas";
import { DistributionPackageSchema } from "./distribution-schemas";

export const ProjectStatusSchema = z.enum([
  "CREATED",
  "RESEARCH_COMPLETE",
  "OPPORTUNITY_COMPLETE",
  "WORLD_COMPLETE",
  "STORYBOARD_COMPLETE",
  "PRODUCTION_PLAN_COMPLETE",
  "COMPLETED",
  "FAILED_WITH_PARTIAL_ARTIFACTS",
]);

export const AgentRunLogSchema = z.object({
  agentName: z.string(),
  latencyMs: z.number(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  model: z.string().optional(),
});

export const ProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  userGoal: z.string(),
  style: z.string(),
  requestedDuration: z.number(),
  status: ProjectStatusSchema,
  llmProvider: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  error: z.string().optional(),
  budgetUSD: z.number().optional(),
  research: ResearchReportSchema.optional(),
  researchEvidence: z.array(ResearchEvidenceSchema).optional(),
  researchSearchIds: z.array(z.string()).optional(),
  opportunity: OpportunitySchema.optional(),
  worldBible: WorldBibleSchema.optional(),
  storyboard: StoryboardSchema.optional(),
  productionPlan: ProductionPlanSchema.optional(),
  logs: z.array(AgentRunLogSchema).optional(),
  costLedger: z.array(CostEntrySchema).optional(),
  imageProvider: z.string().optional(),
  generationPlan: GenerationPlanSchema.optional(),
  generationStatus: GenerationStatusSchema.optional(),
  generationStartedAt: z.number().optional(),
  videoGenerationStatus: GenerationStatusSchema.optional(),
  videoGenerationStartedAt: z.number().optional(),
  finalFilmAssetId: z.string().optional(),
  baseFilmAssetId: z.string().optional(),
  distributionPackage: DistributionPackageSchema.optional(),
  distributionStatus: z.enum(["PENDING", "GENERATING", "COMPLETED", "FAILED"]).optional(),
  voiceoverAssetId: z.string().optional(),
  ownerUid: z.string().optional(),
  actualCostUSD: z.number().optional(),
});

export type Project = z.infer<typeof ProjectSchema>;
export type AgentRunLog = z.infer<typeof AgentRunLogSchema>;

// Legacy migration: v1 projects stored worldBible.locations as string[]
export function parseProjectWithMigration(raw: unknown): Project | null {
  const direct = ProjectSchema.safeParse(raw);
  if (direct.success) return direct.data;
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as any;
  const wb = obj.worldBible;
  if (wb && Array.isArray(wb.locations)) {
    wb.locations = wb.locations.map((l: any) => (typeof l === "string" ? { name: l } : l));
  }
  const second = ProjectSchema.safeParse(obj);
  return second.success ? second.data : null;
}