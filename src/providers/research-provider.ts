import { ResearchEvidence } from "@/core/research-schemas";

export interface ResearchProvider {
  mode: "PARALLEL" | "MOCK";
  gatherEvidence(queries: string[]): Promise<ResearchEvidence[]>;
}