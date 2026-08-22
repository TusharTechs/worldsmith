import { ResearchEvidence } from "@/core/research-schemas";
import { ResearchProvider } from "./research-provider";

// Written against Parallel's published Search API (v1beta).
// Parsing is defensive: tolerates common field-name variants so API drift
// degrades gracefully instead of crashing.
export class ParallelResearchProvider implements ResearchProvider {
  mode = "PARALLEL" as const;

  constructor(private apiKey: string, private baseUrl = "https://api.parallel.ai") {}

  async gatherEvidence(queries: string[]): Promise<ResearchEvidence[]> {
    const collected: ResearchEvidence[] = [];

    for (const query of queries) {
      const res = await fetch(`${this.baseUrl}/v1beta/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          query,
          objective: "Surface current trending topics, recent news, and audience signals for media content research.",
        }),
      });

      if (!res.ok) {
        throw new Error(`[PARALLEL] API error ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      const items: any[] = Array.isArray(data?.results) ? data.results
        : Array.isArray(data?.data) ? data.data
        : Array.isArray(data) ? data
        : [];

      for (const item of items.slice(0, 5)) {
        const url = item?.url ?? item?.link ?? item?.source_url;
        const title = item?.title ?? item?.headline ?? "";
        const snippet = item?.snippet ?? item?.excerpt ?? item?.description ?? item?.content ?? "";
        if (!url || !title) continue;
        collected.push({
          title: String(title),
          url: String(url),
          snippet: String(snippet).slice(0, 600),
          source: "parallel",
          retrievedAt: new Date().toISOString(),
          publishedAt: item?.date ?? item?.published_at ?? undefined,
        });
      }
    }

    const seen = new Set<string>();
    return collected.filter((e) => {
      if (seen.has(e.url)) return false;
      seen.add(e.url);
      return true;
    });
  }
}