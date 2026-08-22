import { GoogleGenerativeAI } from "@google/generative-ai";
import { ImageGenerationProvider, ImageGenerationRequest, GeneratedImage } from "./image-provider";
import { storeImage, fetchReferenceBytes } from "./image-storage";

export class GeminiImageProvider implements ImageGenerationProvider {
  name = "gemini";
  defaultModel: string;
  supportsReferences = true;
  private client: GoogleGenerativeAI;

  constructor(apiKey: string, model?: string) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.defaultModel = model ?? process.env.IMAGE_MODEL ?? "gemini-2.5-flash-image";
  }

  // AI Studio free tier for the hackathon; set real pricing when on a paid tier.
  estimateCost(): number {
    return 0;
  }

  async generate(req: ImageGenerationRequest): Promise<GeneratedImage> {
    const t0 = Date.now();
    const model = this.client.getGenerativeModel({
      model: this.defaultModel,
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] } as any,
    });

    const parts: any[] = [{ text: req.prompt }];
    if (req.references?.length) {
      for (const ref of req.references.slice(0, 2)) {
        const buf = await fetchReferenceBytes(ref);
        if (buf) parts.push({ inlineData: { mimeType: "image/png", data: buf.toString("base64") } });
      }
    }

    const result = await model.generateContent({ contents: [{ role: "user", parts }] } as any);
    const respParts: any[] = result.response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = respParts.find((p) => p.inlineData?.data);
    if (!imagePart) throw new Error("[GEMINI-IMAGE] No image in model response");

    const bytes = Buffer.from(imagePart.inlineData.data, "base64");
    const mimeType = imagePart.inlineData.mimeType ?? "image/png";
    const uri = await storeImage(bytes, mimeType);

    return {
      provider: "gemini",
      model: this.defaultModel,
      uri,
      width: req.width,
      height: req.height,
      seed: req.seed,
      latencyMs: Date.now() - t0,
      costUSD: 0,
      requestId: `gemini-${Date.now()}`,
      promptUsed: req.prompt,
      supportsReferences: true,
      referencesUsed: req.references,
    };
  }
}