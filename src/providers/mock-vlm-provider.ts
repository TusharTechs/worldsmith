import { z } from "zod";
import { VLMProvider, VLMImageInput } from "./vlm-provider";

export class MockVLMProvider implements VLMProvider {
  name = "mock-vlm";

  async evaluate<T extends z.ZodType>(_prompt: string, _images: VLMImageInput[], schema: T) {
    const t0 = Date.now();
    await new Promise((r) => setTimeout(r, 200));
    const fail = (process.env.MOCK_QC_RESULT ?? "pass") === "fail";
    const candidate: any = {
      passed: !fail,
      confidence: fail ? 0.4 : 0.92,
      checks: {
        characterPresent: !fail,
        characterConsistentWithReference: !fail,
        locationConsistent: true,
        requiredPropsPresent: true,
        visualStyleConsistent: true,
        continuityViolation: fail,
        compositionAcceptable: true,
      },
      issues: fail ? ["Mock continuity violation (failure-path test)"] : [],
    };
    const data = schema.parse(candidate);
    return { data, costUSD: 0, latencyMs: Date.now() - t0, model: "mock-vlm" };
  }
}