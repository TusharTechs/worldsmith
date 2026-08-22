import { z } from "zod";

export const QCChecksSchema = z.object({
  characterPresent: z.boolean(),
  characterConsistentWithReference: z.boolean(),
  locationConsistent: z.boolean(),
  requiredPropsPresent: z.boolean(),
  visualStyleConsistent: z.boolean(),
  continuityViolation: z.boolean(),
  compositionAcceptable: z.boolean(),
});

export const QCReportSchema = z.object({
  passed: z.boolean(),
  confidence: z.number().min(0).max(1),
  checks: QCChecksSchema,
  issues: z.array(z.string()),
});

export const QCRecommendationSchema = z.enum(["PASS", "RETRY", "NEEDS_REVIEW"]);
export const QCStatusSchema = z.enum(["PENDING", "PASSED", "FAILED", "NEEDS_REVIEW"]);

export type QCReport = z.infer<typeof QCReportSchema>;
export type QCRecommendation = z.infer<typeof QCRecommendationSchema>;
export type QCStatus = z.infer<typeof QCStatusSchema>;