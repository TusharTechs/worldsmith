import { ResearchEvidence } from "@/core/research-schemas";

/**
 * What one research pass returns.
 *
 * `searchIds` are the provider's own identifiers for the searches that produced this evidence.
 * They are carried through to the UI so a run can be traced back to the exact upstream call —
 * evidence you can point at, rather than a claim that a search happened.
 */
export interface ResearchGathering {
  evidence: ResearchEvidence[];
  searchIds: string[];
}

export interface ResearchProvider {
  mode: "PARALLEL" | "MOCK";
  /**
   * @param queries   the search queries planned for this run
   * @param objective natural-language statement of what the run is actually looking for.
   *                  Providers that accept an objective use it to steer ranking; it is never a
   *                  substitute for the queries themselves.
   */
  gatherEvidence(queries: string[], objective?: string): Promise<ResearchGathering>;
}
