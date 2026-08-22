import { ImageGenerationProvider, ImageGenerationRequest, GeneratedImage } from "./image-provider";

function placeholderSvg(prompt: string, w: number, h: number, label: string): string {
  const trunc = prompt.length > 80 ? prompt.slice(0, 77) + "…" : prompt;
  const safe = trunc.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="100%" height="100%" fill="#18181b"/>
    <rect x="4" y="4" width="${w-8}" height="${h-8}" fill="none" stroke="#71717a" stroke-width="1" stroke-dasharray="6 4"/>
    <text x="${w/2}" y="40" text-anchor="middle" fill="#a78bfa" font-family="monospace" font-size="14" font-weight="700">[${label}]</text>
    <text x="${w/2}" y="${h/2 - 8}" text-anchor="middle" fill="#e4e4e7" font-family="monospace" font-size="12">${safe}</text>
    <text x="${w/2}" y="${h/2 + 14}" text-anchor="middle" fill="#71717a" font-family="monospace" font-size="10">${w}×${h}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export class MockImageGenerationProvider implements ImageGenerationProvider {
  name = "mock";
  defaultModel = "mock-stable-diffusion-v1";
  supportsReferences = false;

  estimateCost(): number {
    return 0;
  }

  async generate(req: ImageGenerationRequest): Promise<GeneratedImage> {
    const t0 = Date.now();
    await new Promise((r) => setTimeout(r, 350 + Math.random() * 250));
    const seed = req.seed ?? Math.floor(Math.random() * 1_000_000);
    return {
      provider: "mock",
      model: this.defaultModel,
      uri: placeholderSvg(req.prompt, req.width, req.height, "MOCK IMAGE"),
      width: req.width,
      height: req.height,
      seed,
      latencyMs: Date.now() - t0,
      costUSD: 0,
      requestId: `mock-${Date.now()}-${seed}`,
      promptUsed: req.prompt,
      supportsReferences: false,
    };
  }
}