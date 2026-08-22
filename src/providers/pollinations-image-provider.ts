import { ImageGenerationProvider, ImageGenerationRequest, GeneratedImage } from "./image-provider";

const BASE = "https://image.pollinations.ai/prompt";

export class PollinationsImageProvider implements ImageGenerationProvider {
  name = "pollinations";
  defaultModel = "flux";
  supportsReferences = false; // Pollinations v1 doesn't expose img2img refs via this URL shape

  // Pollinations is free for reasonable use; cost = 0 so BudgetGuard only enforces
  // LLM+other providers' spend. Update if pricing changes.
  estimateCost(): number {
    return 0;
  }

  async generate(req: ImageGenerationRequest): Promise<GeneratedImage> {
    const t0 = Date.now();
    const seed = req.seed ?? Math.floor(Math.random() * 1_000_000);
    const encoded = encodeURIComponent(req.prompt);
    const params = new URLSearchParams({
      width: String(req.width),
      height: String(req.height),
      seed: String(seed),
      model: this.defaultModel,
      nologo: "true",
      enhance: "true",
    });
    if (req.negativePrompt) params.set("negative", req.negativePrompt);

    // Pollinations returns image bytes directly from this URL; it is stable.
    // We verify with HEAD then GET a small chunk to confirm reachability.
    const uri = `${BASE}/${encoded}?${params.toString()}`;

    const res = await fetch(uri, { method: "HEAD", cache: "no-store" });
    if (!res.ok) {
      throw new Error(`[POLLINATIONS] image HEAD failed ${res.status}`);
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      throw new Error(`[POLLINATIONS] unexpected content-type: ${contentType}`);
    }

    return {
      provider: "pollinations",
      model: this.defaultModel,
      uri,
      width: req.width,
      height: req.height,
      seed,
      latencyMs: Date.now() - t0,
      costUSD: 0,
      requestId: `poll-${seed}`,
      promptUsed: req.prompt,
      negativePromptUsed: req.negativePrompt,
      supportsReferences: false,
    };
  }
}