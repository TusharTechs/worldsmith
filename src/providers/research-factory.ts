import { ResearchProvider } from "./research-provider";
import { ParallelResearchProvider } from "./parallel-research-provider";
import { MockResearchProvider } from "./mock-research-provider";

export function createResearchProvider(): ResearchProvider {
  const pref = process.env.RESEARCH_PROVIDER ?? "auto";
  const key = process.env.PARALLEL_API_KEY;
  if (pref !== "mock" && key) return new ParallelResearchProvider(key);
  return new MockResearchProvider();
}

export function researchProviderMode(): "PARALLEL" | "MOCK" {
  const pref = process.env.RESEARCH_PROVIDER ?? "auto";
  const key = process.env.PARALLEL_API_KEY;
  return pref !== "mock" && key ? "PARALLEL" : "MOCK";
}