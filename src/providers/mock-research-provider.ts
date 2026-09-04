import { ResearchEvidence } from "@/core/research-schemas";
import { ResearchProvider, ResearchGathering } from "./research-provider";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "signal";
}

const EVERGREEN_EVIDENCE: ResearchEvidence[] = [
  { title: "Short-form retention benchmark Q3-2026", url: "https://mock.worldsmith.dev/reports/q3-animation", snippet: "Emotional, character-driven shorts average 78% completion; wordless storytelling travels across languages.", source: "mock", retrievedAt: "2026-08-19T00:00:00Z", publishedAt: "2026-08-11T08:30:00Z" },
  { title: "Competitor scan: low-narrative loops", url: "https://mock.worldsmith.dev/competitors/lofi-loops", snippet: "High volume, low narrative; retention drops after 8s without story beats.", source: "mock", retrievedAt: "2026-08-19T00:00:00Z", publishedAt: "2026-08-10T09:00:00Z" },
];

export class MockResearchProvider implements ResearchProvider {
  mode = "MOCK" as const;

  async gatherEvidence(queries: string[]): Promise<ResearchGathering> {
    await new Promise((r) => setTimeout(r, 700));
    const now = new Date().toISOString();
    const perQuery: ResearchEvidence[] = queries.map((q) => ({
      title: `Simulated signal: ${q}`,
      url: `https://mock.worldsmith.dev/signals/${slugify(q)}`,
      snippet: `Simulated evidence for "${q}". Mock mode is goal-aware but static; connect Parallel for live research.`,
      source: "mock",
      retrievedAt: now,
      publishedAt: now,
    }));
    // No searchIds: mock mode has no upstream call to trace, and inventing an id here would
    // put a fabricated provenance token in front of the user.
    return { evidence: [...perQuery, ...EVERGREEN_EVIDENCE], searchIds: [] };
  }
}