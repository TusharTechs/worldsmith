import { z } from "zod";

export const ResearchEvidenceSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  source: z.string(), // "parallel" | "mock"
  retrievedAt: z.string(),
  publishedAt: z.string().optional(),
});
export type ResearchEvidence = z.infer<typeof ResearchEvidenceSchema>;

export const SearchQueriesSchema = z.object({
  queries: z.array(z.string()).min(2).max(4),
});
export type SearchQueries = z.infer<typeof SearchQueriesSchema>;