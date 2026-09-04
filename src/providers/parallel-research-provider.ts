import { ResearchEvidence } from "@/core/research-schemas";
import { ResearchProvider, ResearchGathering } from "./research-provider";

/** Parallel's ranking modes, fastest to most thorough. */
type SearchMode = "turbo" | "fast" | "base" | "advanced";

const DEFAULT_MODE: SearchMode = "advanced";
const MAX_EVIDENCE = 15;
const MAX_SNIPPET_CHARS = 600;

interface ParallelResult {
  url?: string;
  title?: string | null;
  publish_date?: string | null;
  excerpts?: string[];
  /** Tolerated field-name variants, in case the shape drifts. */
  snippet?: string;
  excerpt?: string;
  description?: string;
  content?: string;
}

/**
 * Parallel Search API (https://docs.parallel.ai) — the first act of every production.
 *
 * Three things about this request are load-bearing and were each got wrong once:
 *
 *  1. The queries go in `search_queries` (an array). An earlier version sent `{ query: "..." }`.
 *     Parallel ignores unknown fields rather than rejecting them, so that version returned
 *     HTTP 200 and plausible-looking results — but the results were ranked against the
 *     `objective` alone, identically for every run. Searching "competitive axe throwing league
 *     Estonia" returned generic social-media-trends articles. Silent, and invisible from the UI.
 *
 *  2. Result bodies live in `excerpts` (an array of strings), not `snippet`. Reading the wrong
 *     field yielded empty evidence, which meant the synthesis step downstream was reasoning over
 *     bare titles while appearing to cite sources properly.
 *
 *  3. Auth is `x-api-key`. Bearer happens to be accepted today; it is not the documented
 *     contract and is not something to depend on.
 *
 * All queries go out in a single batched call — the API is built for it, and issuing one request
 * per query multiplied cost and latency for results that were then deduplicated away.
 */
export class ParallelResearchProvider implements ResearchProvider {
  mode = "PARALLEL" as const;

  constructor(
    private apiKey: string,
    private baseUrl = "https://api.parallel.ai",
    private searchMode: SearchMode = (process.env.PARALLEL_SEARCH_MODE as SearchMode) || DEFAULT_MODE
  ) {}

  async gatherEvidence(queries: string[], objective?: string): Promise<ResearchGathering> {
    const search_queries = queries.map((q) => String(q).trim()).filter(Boolean);
    if (search_queries.length === 0) return { evidence: [], searchIds: [] };

    const res = await fetch(`${this.baseUrl}/v1/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify({
        search_queries,
        objective:
          objective?.trim() ||
          "Surface current trending topics, recent news, and audience signals for media content research.",
        mode: this.searchMode,
      }),
    });

    if (!res.ok) {
      throw new Error(`[PARALLEL] API error ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const items: ParallelResult[] = Array.isArray(data?.results) ? data.results : [];
    const searchIds: string[] = data?.search_id ? [String(data.search_id)] : [];

    const collected: ResearchEvidence[] = [];
    for (const item of items) {
      const url = item?.url;
      const title = item?.title;
      if (!url || !title) continue;
      collected.push({
        title: String(title),
        url: String(url),
        snippet: snippetOf(item),
        source: "parallel",
        retrievedAt: new Date().toISOString(),
        publishedAt: item?.publish_date ?? undefined,
      });
    }

    const seen = new Set<string>();
    const evidence = collected
      .filter((e) => {
        if (seen.has(e.url)) return false;
        seen.add(e.url);
        return true;
      })
      .slice(0, MAX_EVIDENCE);

    return { evidence, searchIds };
  }
}

/**
 * Flatten a result's body into one readable passage.
 *
 * Excerpts arrive as separate fragments lifted from different parts of the page, so they are
 * joined with an ellipsis rather than concatenated — the gap is real and the synthesis step
 * should see it as one.
 */
function snippetOf(item: ParallelResult): string {
  const fromExcerpts = Array.isArray(item.excerpts)
    ? item.excerpts.map((e) => String(e).trim()).filter(Boolean).join(" … ")
    : "";
  const raw = fromExcerpts || item.snippet || item.excerpt || item.description || item.content || "";
  return String(raw).replace(/\s+/g, " ").trim().slice(0, MAX_SNIPPET_CHARS);
}
